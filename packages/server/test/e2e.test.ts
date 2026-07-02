import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ulster1300 } from '@redearl/content-ulster';
import { FakeOrchestrator } from '@redearl/llm';
import type { GameDocument, PlayerView } from '@redearl/engine';
import { buildApp } from '../src/app.js';

/**
 * Full playthroughs over HTTP against the FakeOrchestrator: a diligent earl
 * who audits, studies, pins, and accuses; and a negligent one who hawks his
 * way into the exchequer's December letter. Zero API calls.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'redearl-e2e-'));
const app: FastifyInstance = buildApp({
  orchestrator: new FakeOrchestrator(),
  content: ulster1300,
  dataDir,
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function post(url: string, body?: unknown): Promise<any> {
  const res = await app.inject({ method: 'POST', url, payload: body ?? {} });
  expect(res.statusCode, `${url}: ${res.payload}`).toBeLessThan(300);
  return res.json();
}

async function answerAnyLetters(gameId: string, view: PlayerView): Promise<PlayerView> {
  let v = view;
  for (const d of v.pendingDecisions) {
    const r = await post(`/api/games/${gameId}/decisions`, {
      decisionId: d.id,
      response: 'Pay the fine in coin; the marches cannot spare the men.',
    });
    v = r.view;
  }
  return v;
}

describe('the diligent earl (justice ending)', () => {
  it('audits, pins the contradiction, and breaks the chamberlain', async () => {
    const created = await post('/api/games', { seed: 42 });
    const id: string = created.gameId;
    let view: PlayerView = created.view;

    // No ground truth may ever cross the wire.
    const leakCheck = (v: unknown) => {
      const raw = JSON.stringify(v);
      expect(raw).not.toContain('trueReceipts');
      expect(raw).not.toContain('stolenTotal');
      expect(raw).not.toContain('agendaDirectives');
      expect(raw).not.toContain('"loyalty"');
    };
    leakCheck(view);

    // January: meet the seneschal and order a full audit of the receipts.
    const meet = await post(`/api/games/${id}/meetings`, { personId: 'mandeville' });
    expect(typeof meet.opening).toBe('string');
    await post(`/api/games/${id}/meetings/${meet.meetingId}/messages`, {
      text: 'Something in the rolls sits ill with me. I want an audit — ride the manors and take true tallies.',
    });
    const concluded = await post(`/api/games/${id}/meetings/${meet.meetingId}/conclude`);
    const actions = concluded.proposedActions.map((p: any) => p.action);
    expect(actions).toContainEqual({ type: 'order_audit' });
    await post(`/api/games/${id}/orders`, { actions });
    let turn = await post(`/api/games/${id}/end-turn`);
    view = turn.view;
    leakCheck(view);

    // February: the audit is in. Study, then cross-reference the audit
    // against the receiver's roll the way a player would: same month, same
    // manor, different figure.
    await post(`/api/games/${id}/study`);
    const docs: GameDocument[] = view.documents;
    const audit = docs.find((d) => d.kind === 'audit_report')!;
    const roll = docs.find((d) => d.kind === 'receivers_roll' && d.month === 0)!;
    expect(audit).toBeDefined();

    let surfacedTotal = 0;
    for (const line of audit.lines) {
      const m = /^m(\d+)_(.+)$/.exec(line.id);
      if (!m || m[1] !== '0') continue;
      const rollLine = roll.lines.find((l) => l.id === `h_${m[2]}`);
      if (!rollLine || rollLine.value === line.value) continue;
      await post(`/api/games/${id}/pins`, { docId: roll.id, lineId: rollLine.id });
      const pinned = await post(`/api/games/${id}/pins`, { docId: audit.id, lineId: line.id });
      surfacedTotal += pinned.surfaced.length;
      view = pinned.view;
    }
    expect(surfacedTotal).toBe(2); // two manors were being skimmed
    expect(view.evidence.length).toBe(2);

    // Confront the chamberlain before the whole court.
    const confront = await post(`/api/games/${id}/meetings`, { personId: 'nicholas' });
    await post(`/api/games/${id}/meetings/${confront.meetingId}/messages`, {
      text: 'Master Nicholas, the tallies of the manors do not agree with your rolls. I accuse Nicholas of theft from my treasury.',
    });
    const c2 = await post(`/api/games/${id}/meetings/${confront.meetingId}/conclude`);
    const accuse = c2.proposedActions.map((p: any) => p.action).find((a: any) => a.type === 'accuse');
    expect(accuse).toBeDefined();
    expect(accuse.accusedId).toBe('nicholas');
    const verdict = await post(`/api/games/${id}/orders`, { actions: [accuse] });
    expect(verdict.accusationOutcome).toBe('exposed');
    expect(verdict.courtScene).toContain('confess');

    // Play out the rest of the year.
    view = verdict.view;
    while (!view.over) {
      view = await answerAnyLetters(id, view);
      const turnRes = await post(`/api/games/${id}/end-turn`);
      view = turnRes.view;
    }
    expect(view.reveal!.ending).toBe('justice');
    expect(view.reveal!.recovered).toBeGreaterThan(0);
    expect(view.reveal!.timeline.some((t) => t.text.includes('pockets'))).toBe(true);
    leakCheck({ ...view, reveal: undefined }); // reveal is allowed to tell all
  });
});

describe('the negligent earl (audit ending)', () => {
  it('hawks through the year and learns of the theft from Dublin', async () => {
    const created = await post('/api/games', { seed: 7 });
    const id: string = created.gameId;
    let view: PlayerView = created.view;

    while (!view.over) {
      view = await answerAnyLetters(id, view);
      while (view.slots > 0) {
        const r = await post(`/api/games/${id}/leisure`, { kind: 'hawking' });
        view = r.view;
      }
      view = await answerAnyLetters(id, view);
      const turn = await post(`/api/games/${id}/end-turn`);
      view = turn.view;
    }

    expect(view.reveal!.ending).toBe('audit');
    expect(view.reveal!.stolenTotal).toBeGreaterThan(0);
    expect(view.reveal!.recovered).toBe(0);
    // The paperwork was whispering all along: the falsified rolls were delivered.
    expect(view.documents.filter((d) => d.kind === 'receivers_roll').length).toBe(12);
    // The exchequer's letter arrived.
    expect(view.documents.some((d) => d.id === 'letter_audit')).toBe(true);
  });
});

describe('transport details', () => {
  it('meeting messages stream as SSE when asked', async () => {
    const created = await post('/api/games', { seed: 3 });
    const id: string = created.gameId;
    const meet = await post(`/api/games/${id}/meetings`, { personId: 'logan' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/games/${id}/meetings/${meet.meetingId}/messages`,
      payload: { text: 'How stand the walls, constable?' },
      headers: { accept: 'text/event-stream' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('event: token');
    expect(res.payload).toContain('event: done');
  });

  it('rejects pinning before studying', async () => {
    const created = await post('/api/games', { seed: 5 });
    const id: string = created.gameId;
    await post(`/api/games/${id}/end-turn`);
    const res = await app.inject({
      method: 'POST',
      url: `/api/games/${id}/pins`,
      payload: { docId: 'roll_m0', lineId: 'total' },
    });
    expect(res.statusCode).toBe(400);
  });
});
