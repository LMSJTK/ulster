import { useEffect, useRef, useState } from 'react';
import type { Action, PlayerView } from '@redearl/engine';
import { api, streamMessage } from './api.js';

export interface MeetingUI {
  meetingId: string;
  personId: string;
  personName: string;
  personTitle: string;
  msgs: { role: 'player' | 'npc'; text: string }[];
  streamText: string | null;
  concludeResult: {
    summary: string;
    proposedActions: { action: Action; description: string }[];
    selected: boolean[];
  } | null;
}

interface Props {
  gameId: string;
  meeting: MeetingUI;
  setMeeting: (m: MeetingUI | null) => void;
  onConcluded: (v: PlayerView) => void;
  onConfirm: (actions: Action[]) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  notify: (msg: string) => void;
}

export function Meeting({ gameId, meeting, setMeeting, onConcluded, onConfirm, busy, setBusy, notify }: Props) {
  const [input, setInput] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [meeting.msgs.length, meeting.streamText]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || meeting.concludeResult) return;
    setInput('');
    setBusy(true);
    let m: MeetingUI = {
      ...meeting,
      msgs: [...meeting.msgs, { role: 'player', text }],
      streamText: '',
    };
    setMeeting(m);
    try {
      let acc = '';
      const full = await streamMessage(gameId, meeting.meetingId, text, (t) => {
        acc += t;
        setMeeting({ ...m, streamText: acc });
      });
      m = { ...m, msgs: [...m.msgs, { role: 'npc', text: full || acc }], streamText: null };
      setMeeting(m);
    } catch (err) {
      notify((err as Error).message);
      setMeeting({ ...m, streamText: null });
    } finally {
      setBusy(false);
    }
  };

  const conclude = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.concludeMeeting(gameId, meeting.meetingId);
      onConcluded(r.view);
      if (r.surfaced.length > 0) {
        notify('Something said in that audience is worth remembering — see your evidence.');
      }
      if (r.proposedActions.length === 0) {
        notify(`${r.summary} No orders were given.`);
        setMeeting(null);
      } else {
        setMeeting({
          ...meeting,
          concludeResult: {
            summary: r.summary,
            proposedActions: r.proposedActions,
            selected: r.proposedActions.map(() => true),
          },
        });
      }
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cr = meeting.concludeResult;

  return (
    <div className="overlay">
      <div className="meeting parchment">
        <div className="meeting-head">
          <div>
            <div className="card-name">{meeting.personName}</div>
            <div className="card-title">{meeting.personTitle}</div>
          </div>
          {!cr && (
            <button onClick={conclude} disabled={busy}>Conclude the audience</button>
          )}
        </div>

        <div className="meeting-log" ref={logRef}>
          {meeting.msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <span className="who">{m.role === 'player' ? 'You' : meeting.personName.split(' ')[1] ?? meeting.personName}</span>
              <p>{m.text}</p>
            </div>
          ))}
          {meeting.streamText !== null && (
            <div className="msg npc">
              <span className="who">{meeting.personName.split(' ')[1] ?? meeting.personName}</span>
              <p>{meeting.streamText}<span className="cursor">▍</span></p>
            </div>
          )}
        </div>

        {!cr && (
          <div className="meeting-input">
            <textarea
              value={input}
              placeholder="Say what you will — question, order, promise, threat…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="primary" onClick={send} disabled={busy || !input.trim()}>Speak</button>
          </div>
        )}

        {cr && (
          <div className="orders">
            <h3>The clerk reads back your instructions</h3>
            <p className="hint">{cr.summary}</p>
            {cr.proposedActions.map((p, i) => (
              <label key={i} className="order-row">
                <input
                  type="checkbox"
                  checked={cr.selected[i]}
                  onChange={() => {
                    const selected = [...cr.selected];
                    selected[i] = !selected[i];
                    setMeeting({ ...meeting, concludeResult: { ...cr, selected } });
                  }}
                />
                <span>{p.description}</span>
              </label>
            ))}
            <div className="order-buttons">
              <button
                className="primary"
                disabled={busy}
                onClick={() => onConfirm(cr.proposedActions.filter((_, i) => cr.selected[i]).map((p) => p.action))}
              >
                It is so ordered
              </button>
              <button disabled={busy} onClick={() => onConfirm([])}>Let it lie</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
