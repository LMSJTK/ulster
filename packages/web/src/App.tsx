import { useCallback, useEffect, useState } from 'react';
import type { Action, PlayerView } from '@redearl/engine';
import { api } from './api.js';
import { Archive } from './Archive.js';
import { EndScreen } from './EndScreen.js';
import { Meeting, type MeetingUI } from './Meeting.js';

type Tab = 'court' | 'archive' | 'evidence';

export function App() {
  const [gameId, setGameId] = useState<string | null>(() => localStorage.getItem('redearl.gameId'));
  const [view, setView] = useState<PlayerView | null>(null);
  const [tab, setTab] = useState<Tab>('court');
  const [meeting, setMeeting] = useState<MeetingUI | null>(null);
  const [scene, setScene] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 8000);
  }, []);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, notify]);

  const newGame = useCallback(() => guard(async () => {
    const r = await api.newGame();
    localStorage.setItem('redearl.gameId', r.gameId);
    setGameId(r.gameId);
    setView(r.view);
    setMeeting(null);
    setScene(null);
    setTab('court');
  }), [guard]);

  useEffect(() => {
    (async () => {
      if (!gameId) return;
      try {
        const r = await api.getView(gameId);
        setView(r.view);
      } catch {
        localStorage.removeItem('redearl.gameId');
        setGameId(null);
      }
    })();
  }, [gameId]);

  if (!gameId || !view) {
    return (
      <div className="title-screen">
        <h1>The Red Earl</h1>
        <p className="subtitle">Ulster, in the year of grace 1300</p>
        <p className="blurb">
          You are Richard de Burgh, Earl of Ulster. You will not see the map. You will see what
          your officers bring you: their counsel, their reports, their receipts. Some of it will
          even be true.
        </p>
        <button className="primary" onClick={newGame} disabled={busy}>Take up the earldom</button>
      </div>
    );
  }

  const summon = (personId: string) => guard(async () => {
    const r = await api.startMeeting(gameId, personId);
    const person = view.council.find((c) => c.id === personId)!;
    setView(r.view);
    setMeeting({
      meetingId: r.meetingId,
      personId,
      personName: person.name,
      personTitle: person.title,
      msgs: [{ role: 'npc', text: r.opening }],
      streamText: null,
      concludeResult: null,
    });
  });

  const confirmOrders = (actions: Action[]) => guard(async () => {
    const r = await api.confirmOrders(gameId, actions);
    setView(r.view);
    setMeeting(null);
    if (r.courtScene) setScene(r.courtScene);
    else if (actions.length > 0) notify('Your orders are given; they will be carried out as the month turns.');
  });

  const endTurn = () => guard(async () => {
    const r = await api.endTurn(gameId);
    setView(r.view);
    setTab('court');
    setMeeting(null);
  });

  const study = () => guard(async () => {
    const r = await api.study(gameId);
    setView(r.view);
    setTab('archive');
    notify('You spend the afternoon among the rolls. Figures may now be marked and compared.');
  });

  const leisure = (kind: string) => guard(async () => {
    const r = await api.leisure(gameId, kind);
    setView(r.view);
    notify(r.note);
  });

  const answerLetter = (decisionId: string) => guard(async () => {
    const response = answers[decisionId]?.trim();
    if (!response) return;
    const r = await api.decide(gameId, decisionId, response);
    setView(r.view);
    notify(r.note);
  });

  const briefing = view.briefings[view.briefings.length - 1];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="sigil">✠</span>
          <div>
            <div className="title">The Red Earl</div>
            <div className="date">{view.monthName} · Carrickfergus</div>
          </div>
        </div>
        <div className="stats">
          <Stat label="Treasury" value={view.treasuryLabel} />
          <Stat label="Prestige" value={String(view.prestige)} />
          <Stat label="Standing" value={String(view.reputation)} />
          <Stat label="Time" value={'●'.repeat(view.slots) + '○'.repeat(Math.max(0, 3 - view.slots))} />
        </div>
        <button className="primary" onClick={endTurn} disabled={busy || view.over}>
          Let the month turn ▸
        </button>
      </header>

      <nav>
        {(['court', 'archive', 'evidence'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'court' ? 'The Court' : t === 'archive' ? `The Archive (${view.documents.length})` : `Evidence (${view.evidence.length})`}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'court' && (
          <div className="court">
            <section className="parchment briefing">
              <h3>The morning's briefing</h3>
              <p>{briefing?.text}</p>
            </section>

            {view.pendingDecisions.map((d) => (
              <section key={d.id} className="parchment letter">
                <h3>⚜ A letter awaits your answer</h3>
                <p className="letter-text">{d.prompt}</p>
                <textarea
                  placeholder="Answer in your own words — dictate your reply or your orders…"
                  value={answers[d.id] ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [d.id]: e.target.value })}
                />
                <button className="primary" onClick={() => answerLetter(d.id)} disabled={busy}>
                  Seal and send
                </button>
              </section>
            ))}

            <section>
              <h3 className="rule">Your council</h3>
              <div className="council">
                {view.council.map((c) => (
                  <div key={c.id} className="card">
                    <div className="card-name">{c.name}</div>
                    <div className="card-title">{c.title}</div>
                    <div className={`card-disp disp-${c.disposition}`}>{c.disposition}</div>
                    <button onClick={() => summon(c.id)} disabled={busy || view.slots <= 0 || view.over}>
                      Summon
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="rule">Your day</h3>
              <div className="day-actions">
                <button onClick={study} disabled={busy || view.slots <= 0 || view.studiedThisMonth || view.over}>
                  📜 Study the rolls {view.studiedThisMonth ? '(done this month)' : ''}
                </button>
                <button onClick={() => leisure('hawking')} disabled={busy || view.slots <= 0 || view.over}>🦅 Go hawking</button>
                <button onClick={() => leisure('hunt')} disabled={busy || view.slots <= 0 || view.over}>🏹 Ride to the hunt</button>
                <button onClick={() => leisure('feast')} disabled={busy || view.slots <= 0 || view.over}>🍷 Hold a feast (£2)</button>
              </div>
              <p className="hint">
                Three matters a month, no more. Meetings uncover what men will say; the rolls hold
                what they wrote down. The difference is where the truth lives.
              </p>
            </section>
          </div>
        )}

        {tab === 'archive' && (
          <Archive view={view} gameId={gameId} onView={setView} onNotify={notify} />
        )}

        {tab === 'evidence' && (
          <div className="evidence">
            {view.evidence.length === 0 && (
              <p className="hint">
                Nothing yet. Evidence surfaces when you pin two figures that contradict each other
                in the archive, or when someone tells you something worth knowing.
              </p>
            )}
            {view.evidence.map((e) => (
              <div key={e.id} className="parchment ev-card">
                <span className="ev-kind">{e.kind === 'discrepancy' ? '⚖ The paperwork disagrees' : e.kind === 'testimony' ? '👤 Sworn word' : '🗣 Rumor'}</span>
                <p>{e.description}</p>
                <span className="ev-weight">weight {'●'.repeat(e.strength)}</span>
              </div>
            ))}
            {view.evidence.length > 0 && (
              <p className="hint">
                To act on it, summon the man and accuse him to his face. Weak proofs will not
                survive the hall.
              </p>
            )}
          </div>
        )}
      </main>

      {meeting && (
        <Meeting
          gameId={gameId}
          meeting={meeting}
          setMeeting={setMeeting}
          onConcluded={(v) => setView(v)}
          onConfirm={confirmOrders}
          busy={busy}
          setBusy={setBusy}
          notify={notify}
        />
      )}

      {scene && (
        <div className="overlay" onClick={() => setScene(null)}>
          <div className="parchment scene" onClick={(e) => e.stopPropagation()}>
            <h3>In the great hall</h3>
            <p>{scene}</p>
            <button className="primary" onClick={() => setScene(null)}>So be it</button>
          </div>
        </div>
      )}

      {view.over && view.reveal && <EndScreen reveal={view.reveal} onNewGame={newGame} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
