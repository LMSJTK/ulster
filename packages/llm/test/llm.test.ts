import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AdjudicationSchema, advanceMonth, buildActorContext, buildAdjudicateContext,
  createGame, type ChatMsg,
} from '@redearl/engine';
import { testPack } from '../../engine/test/fixture.js';
import { FakeOrchestrator } from '../src/fake.js';
import { LiveOrchestrator, type MinimalAnthropicClient } from '../src/live.js';
import { buildActorSystem } from '../src/prompts.js';

const fake = new FakeOrchestrator();

function meetingTranscript(playerText: string, npcText = ''): ChatMsg[] {
  const t: ChatMsg[] = [{ role: 'player', text: playerText }];
  if (npcText) t.push({ role: 'npc', text: npcText });
  return t;
}

describe('FakeOrchestrator adjudication', () => {
  it('extracts a receipts request for a named holding', async () => {
    const s = createGame(testPack, 1, 'g');
    const ctx = buildAdjudicateContext(s, testPack, 'sen');
    const adj = await fake.adjudicate(ctx, meetingTranscript(
      'Have the bailiff of Northfield send me his receipts for the last months.'), testPack);
    expect(adj.actions).toContainEqual(
      { type: 'request_document', docKind: 'bailiff_receipts', holdingId: 'northfield' });
  });

  it('extracts an audit order and an accusation with surfaced evidence', async () => {
    const s = createGame(testPack, 1, 'g');
    s.evidence.find((e) => e.id === 'ev_rumor')!.surfaced = true;
    const ctx = buildAdjudicateContext(s, testPack, 'cham');
    const adj = await fake.adjudicate(ctx, meetingTranscript(
      'I want an audit of every manor. And I accuse Cham of theft.'), testPack);
    expect(adj.actions.some((a) => a.type === 'order_audit')).toBe(true);
    const accuse = adj.actions.find((a) => a.type === 'accuse');
    expect(accuse).toMatchObject({ accusedId: 'cham', citedEvidence: ['ev_rumor'] });
  });

  it('rates tone from the player wording', async () => {
    const s = createGame(testPack, 1, 'g');
    const ctx = buildAdjudicateContext(s, testPack, 'sen');
    const warm = await fake.adjudicate(ctx, meetingTranscript('Thank you, well done as ever.'), testPack);
    const harsh = await fake.adjudicate(ctx, meetingTranscript('You worthless dog.'), testPack);
    expect(warm.tone).toBe(1);
    expect(harsh.tone).toBe(-1);
  });
});

describe('FakeOrchestrator actor + disclosure loop', () => {
  it('the schemer deflects questions about figures', async () => {
    const s = createGame(testPack, 1, 'g');
    const ctx = buildActorContext(s, testPack, s.plot.schemerId);
    const reply = await fake.actorReply(ctx, meetingTranscript('Walk me through the receipts this month.'), testPack);
    expect(reply.toLowerCase()).toContain('nothing in the sums');
  });

  it('a guarded confidence, once spoken, is detected by the adjudicator', async () => {
    const s = createGame(testPack, 1, 'g');
    advanceMonth(s, testPack);
    advanceMonth(s, testPack); // the tick closing witnessMonth=1 lands the belief on the clerk
    const actorCtx = buildActorContext(s, testPack, 'clerk');
    const question = 'Tell me, brother: has anything about the receiver seemed amiss to you?';
    const reply = await fake.actorReply(actorCtx, meetingTranscript(question), testPack);
    expect(reply).toContain(testPack.plot.witnessBelief);

    const adjCtx = buildAdjudicateContext(s, testPack, 'clerk');
    const adj = await fake.adjudicate(adjCtx, [
      { role: 'player', text: question },
      { role: 'npc', text: reply },
    ], testPack);
    expect(adj.disclosedBeliefs).toContain('belief_testimony');
  });
});

describe('knowledge scoping in prompts', () => {
  it('the schemer prompt carries the secret; honest prompts do not', () => {
    const s = createGame(testPack, 1, 'g');
    const schemer = buildActorSystem(buildActorContext(s, testPack, s.plot.schemerId), testPack);
    expect(schemer).toContain('SECRET');
    for (const p of testPack.persons) {
      if (p.id === s.plot.schemerId) continue;
      const honest = buildActorSystem(buildActorContext(s, testPack, p.id), testPack);
      expect(honest).not.toContain('SECRET');
      expect(honest).not.toContain('skimming');
    }
  });
});

describe('LiveOrchestrator validation harness', () => {
  function stubClient(responses: unknown[]): MinimalAnthropicClient {
    let i = 0;
    return {
      messages: {
        create: async () => {
          const r = responses[Math.min(i, responses.length - 1)];
          i += 1;
          return r;
        },
      },
    };
  }

  const toolUse = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'record_meeting', input }] });

  it('repairs a malformed record on the second attempt', async () => {
    const bad = toolUse({ actions: 'not-an-array' });
    const good = toolUse({
      actions: [{ type: 'order_audit' }],
      disclosedBeliefs: [],
      tone: 0,
      summary: 'ok',
    });
    const live = new LiveOrchestrator(stubClient([bad, good]));
    const s = createGame(testPack, 1, 'g');
    const adj = await live.adjudicate(buildAdjudicateContext(s, testPack, 'sen'),
      meetingTranscript('Audit everything.'), testPack);
    expect(adj.actions).toEqual([{ type: 'order_audit' }]);
  });

  it('filters hallucinated ids out of a valid-shaped record', async () => {
    const sloppy = toolUse({
      actions: [
        { type: 'request_document', docKind: 'bailiff_receipts', holdingId: 'atlantis' },
        { type: 'request_document', docKind: 'bailiff_receipts', holdingId: 'northfield' },
        { type: 'accuse', accusedId: 'cham', citedEvidence: ['ev_made_up'] },
      ],
      disclosedBeliefs: ['belief_made_up'],
      tone: 0,
      summary: 'ok',
    });
    const live = new LiveOrchestrator(stubClient([sloppy]));
    const s = createGame(testPack, 1, 'g');
    const adj = await live.adjudicate(buildAdjudicateContext(s, testPack, 'cham'),
      meetingTranscript('Receipts and an accusation.'), testPack);
    expect(adj.actions).toEqual([
      { type: 'request_document', docKind: 'bailiff_receipts', holdingId: 'northfield' },
      { type: 'accuse', accusedId: 'cham', citedEvidence: [] },
    ]);
    expect(adj.disclosedBeliefs).toEqual([]);
  });

  it('falls back to the deterministic fake after repeated failures', async () => {
    const live = new LiveOrchestrator(stubClient([{ content: [] }, { content: [] }]));
    const s = createGame(testPack, 1, 'g');
    const adj = await live.adjudicate(buildAdjudicateContext(s, testPack, 'sen'),
      meetingTranscript('Order an audit of the manors.'), testPack);
    expect(adj.actions.some((a) => a.type === 'order_audit')).toBe(true);
  });

  it('the adjudication schema converts to a JSON-schema tool definition', () => {
    const schema = z.toJSONSchema(AdjudicationSchema) as { type?: string; properties?: object };
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('actions');
  });
});
