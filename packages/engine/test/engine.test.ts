import { describe, expect, it } from 'vitest';
import {
  advanceMonth, buildActorContext, buildPlayerView, concludeMeeting, confirmOrders,
  createGame, doLeisure, doStudy, resolveAccusation, skimRate, startMeeting, togglePin,
} from '../src/index.js';
import type { GameState } from '../src/index.js';
import { testPack } from './fixture.js';

const SEED = 12345;

function newGame(seed = SEED): GameState {
  return createGame(testPack, seed, 'g1');
}

describe('determinism', () => {
  it('same seed and same script produce identical worlds', () => {
    const run = () => {
      const s = newGame();
      doLeisure(s, testPack, 'hawking');
      for (let i = 0; i < 12; i++) advanceMonth(s, testPack);
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('different seeds pick different worlds eventually', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      targets.add(createGame(testPack, seed, 'g').plot.targetHoldings.join(','));
    }
    expect(targets.size).toBeGreaterThan(1);
  });
});

describe('the skim (epistemics pipeline)', () => {
  it('reported receipts understate true receipts on target holdings only', () => {
    const s = newGame();
    advanceMonth(s, testPack);
    for (const h of testPack.holdings) {
      const hs = s.holdings[h.id];
      const t = hs.trueReceipts[0]!;
      const r = hs.reportedReceipts[0]!;
      if (s.plot.targetHoldings.includes(h.id)) {
        expect(r).toBe(t - Math.floor((t * 60) / 1000));
        expect(r).toBeLessThan(t);
      } else {
        expect(r).toBe(t);
      }
    }
    expect(s.plot.stolenTotal).toBeGreaterThan(0);
  });

  it('treasury receives reported (not true) sums — the books balance', () => {
    const s = newGame();
    advanceMonth(s, testPack);
    const reported = testPack.holdings.reduce(
      (sum, h) => sum + s.holdings[h.id].reportedReceipts[0]!, 0);
    expect(s.treasury).toBe(testPack.startingTreasury + reported - testPack.monthlyExpenses);
  });

  it('requesting bailiff receipts plants a findable discrepancy', () => {
    const s = newGame();
    const target = s.plot.targetHoldings[0];
    confirmOrders(s, testPack, [
      { type: 'request_document', docKind: 'bailiff_receipts', holdingId: target },
    ]);
    advanceMonth(s, testPack);

    const ev = s.evidence.find((e) => e.id === `ev_disc_${target}_m0`);
    expect(ev).toBeDefined();
    expect(ev!.surfaced).toBe(false);
    expect(ev!.docRefs).toBeDefined();

    // Pinning both sides surfaces it.
    const { a, b } = ev!.docRefs!;
    togglePin(s, testPack, a.docId, a.lineId);
    const res = togglePin(s, testPack, b.docId, b.lineId);
    expect(res.surfaced).toContain(ev!.id);
    expect(s.evidence.find((e) => e.id === ev!.id)!.surfaced).toBe(true);
  });

  it('a full audit plants discrepancies for every skimmed month in the window', () => {
    const s = newGame();
    advanceMonth(s, testPack); // close Jan
    advanceMonth(s, testPack); // close Feb
    confirmOrders(s, testPack, [{ type: 'order_audit' }]);
    advanceMonth(s, testPack); // close Mar, audit covers Jan-Mar
    for (const target of s.plot.targetHoldings) {
      for (const m of [0, 1, 2]) {
        expect(s.evidence.some((e) => e.id === `ev_disc_${target}_m${m}`)).toBe(true);
      }
    }
    // Honest holdings never contradict.
    const honest = testPack.holdings.filter((h) => !s.plot.targetHoldings.includes(h.id));
    for (const h of honest) {
      expect(s.evidence.some((e) => e.id.startsWith(`ev_disc_${h.id}`))).toBe(false);
    }
  });
});

describe('knowledge scoping', () => {
  it('only the schemer carries agenda directives; others carry none', () => {
    const s = newGame();
    for (const p of testPack.persons) {
      const ctx = buildActorContext(s, testPack, p.id);
      if (p.id === s.plot.schemerId) {
        expect(ctx.agendaDirectives.length).toBeGreaterThan(0);
        expect(ctx.agendaDirectives.join(' ')).toContain('SECRET');
      } else {
        expect(ctx.agendaDirectives).toEqual([]);
      }
    }
  });

  it('the player view never leaks ground truth', () => {
    const s = newGame();
    advanceMonth(s, testPack);
    const view = buildPlayerView(s, testPack);
    const raw = JSON.stringify(view);
    expect(raw).not.toContain('trueReceipts');
    expect(raw).not.toContain('stolenTotal');
    expect(raw).not.toContain('agendaDirectives');
    expect(raw).not.toContain('loyalty');
    expect(view.evidence).toEqual([]); // nothing surfaced yet
    expect(view.reveal).toBeUndefined();
  });
});

describe('accusation', () => {
  function surfaceStrongEvidence(s: GameState): void {
    const target = s.plot.targetHoldings[0];
    confirmOrders(s, testPack, [{ type: 'order_audit' }]);
    advanceMonth(s, testPack);
    for (const ev of s.evidence) {
      if (ev.id.startsWith(`ev_disc_`) && ev.docRefs) {
        togglePin(s, testPack, ev.docRefs.a.docId, ev.docRefs.a.lineId);
        togglePin(s, testPack, ev.docRefs.b.docId, ev.docRefs.b.lineId);
      }
    }
    expect(s.evidence.filter((e) => e.surfaced).length).toBeGreaterThanOrEqual(2);
  }

  it('with strong proof the schemer is exposed and funds recovered', () => {
    const s = newGame();
    surfaceStrongEvidence(s);
    const before = s.treasury;
    const res = resolveAccusation(s, testPack, s.plot.schemerId, []);
    expect(res.outcome).toBe('exposed');
    expect(s.plot.status).toBe('exposed');
    expect(res.recovered).toBe(Math.floor(s.plot.stolenTotal * 0.6));
    expect(s.treasury).toBe(before + res.recovered);
  });

  it('with thin proof the schemer denies and turns cautious', () => {
    const s = newGame();
    // Surface only the rumor (strength 1) plus testimony (2) = 3 -> denied.
    s.evidence.find((e) => e.id === 'ev_rumor')!.surfaced = true;
    s.evidence.find((e) => e.id === 'ev_testimony')!.surfaced = true;
    const res = resolveAccusation(s, testPack, s.plot.schemerId, []);
    expect(res.outcome).toBe('denied');
    expect(s.plot.status).toBe('paused');
    expect(s.plot.cautious).toBe(true);
  });

  it('accusing the wrong man is a false accusation and costs the court dearly', () => {
    const s = newGame();
    surfaceStrongEvidence(s);
    const innocent = testPack.persons.find((p) => p.id !== s.plot.schemerId)!;
    const before = s.persons[innocent.id].relationship;
    const res = resolveAccusation(s, testPack, innocent.id, []);
    expect(res.outcome).toBe('false');
    expect(s.persons[innocent.id].relationship).toBeLessThan(before);
  });

  it('a cautious, paused plot skims nothing, then resumes at half rate', () => {
    const s = newGame();
    s.evidence.find((e) => e.id === 'ev_rumor')!.surfaced = true;
    s.evidence.find((e) => e.id === 'ev_testimony')!.surfaced = true;
    resolveAccusation(s, testPack, s.plot.schemerId, []);
    expect(skimRate(s.plot, s.month)).toBe(0);
    advanceMonth(s, testPack);
    advanceMonth(s, testPack);
    expect(s.plot.status).toBe('active');
    expect(skimRate(s.plot, s.month)).toBe(30); // 60 halved
  });
});

describe('the year and its endings', () => {
  it('a negligent year ends in the audit ending', () => {
    const s = newGame();
    for (let i = 0; i < 12; i++) advanceMonth(s, testPack);
    expect(s.over).toBe(true);
    expect(s.ending).toBe('audit');
    const view = buildPlayerView(s, testPack);
    expect(view.reveal).toBeDefined();
    expect(view.reveal!.stolenTotal).toBeGreaterThan(0);
    expect(view.reveal!.timeline.length).toBeGreaterThan(5);
  });

  it('exposing the plot yields the justice ending', () => {
    const s = newGame();
    confirmOrders(s, testPack, [{ type: 'order_audit' }]);
    advanceMonth(s, testPack);
    for (const ev of s.evidence) {
      if (ev.docRefs) {
        togglePin(s, testPack, ev.docRefs.a.docId, ev.docRefs.a.lineId);
        togglePin(s, testPack, ev.docRefs.b.docId, ev.docRefs.b.lineId);
      }
    }
    resolveAccusation(s, testPack, s.plot.schemerId, []);
    while (!s.over) advanceMonth(s, testPack);
    expect(s.ending).toBe('justice');
  });
});

describe('actions and slots', () => {
  it('meetings, study, and leisure each cost a slot; a fourth is refused', () => {
    const s = newGame();
    startMeeting(s, testPack, 'sen');
    doStudy(s);
    doLeisure(s, testPack, 'feast');
    expect(s.slots).toBe(0);
    expect(() => doLeisure(s, testPack, 'hunt')).toThrow();
  });

  it('freeform effects are clamped to the per-category caps', () => {
    const s = newGame();
    const before = s.treasury;
    confirmOrders(s, testPack, [{
      type: 'freeform',
      description: 'Conjure a fortune',
      effects: [{ kind: 'treasury', delta: 100000 }],
    }]);
    advanceMonth(s, testPack);
    const reported = testPack.holdings.reduce(
      (sum, h) => sum + s.holdings[h.id].reportedReceipts[0]!, 0);
    expect(s.treasury).toBe(before + 100 + reported - testPack.monthlyExpenses);
  });

  it('meeting tone moves the relationship; disclosures surface evidence', () => {
    const s = newGame();
    advanceMonth(s, testPack); // clerk gains the guarded belief at witnessMonth=1
    advanceMonth(s, testPack);
    const meeting = startMeeting(s, testPack, 'clerk');
    meeting.transcript.push({ role: 'player', text: 'Speak plainly, brother.' });
    meeting.transcript.push({ role: 'npc', text: 'The receiver works late...' });
    const relBefore = s.persons['clerk'].relationship;
    const { surfaced } = concludeMeeting(s, testPack, meeting.id, {
      actions: [],
      disclosedBeliefs: ['belief_testimony'],
      tone: 1,
      summary: 'The clerk confided his unease.',
    });
    expect(surfaced).toContain('ev_testimony');
    expect(s.persons['clerk'].relationship).toBe(relBefore + 3);
  });
});
