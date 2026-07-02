import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ActionSchema, advanceMonth, buildActorContext, buildAdjudicateContext,
  buildPlayerView, concludeMeeting, confirmOrders, createGame, describeAction,
  doLeisure, doStudy, getMeeting, resolveDecision, startMeeting, togglePin,
  type Action, type ContentPack, type GameState,
} from '@redearl/engine';
import type { Orchestrator } from '@redearl/llm';
import { GameStore } from './store.js';

export interface AppOptions {
  orchestrator: Orchestrator;
  content: ContentPack;
  dataDir: string;
  staticRoot?: string;
}

const INTRO =
  'It is the first of January, 1300. Rain off the lough, smoke in the hall, and a year\'s worth of ' +
  'the earldom\'s business waiting on your pleasure. Your officers will tell you what they choose to ' +
  'tell you; the paperwork will say what it says; the two are not always the same thing. ' +
  'You have time for three matters a month. Spend it as befits an earl — however you take that to mean.';

export function buildApp(opts: AppOptions): FastifyInstance {
  const { orchestrator, content } = opts;
  const store = new GameStore(opts.dataDir);
  const app = Fastify({ logger: false });

  function game(id: string): GameState {
    const state = store.get(id);
    if (!state) throw Object.assign(new Error('no such game'), { statusCode: 404 });
    return state;
  }

  function view(state: GameState) {
    return buildPlayerView(state, content);
  }

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    reply.code(err.statusCode ?? 400).send({ error: err.message });
  });

  app.get('/api/health', async () => ({ ok: true, live: orchestrator.live }));

  app.post('/api/games', async (req) => {
    const body = z.object({ seed: z.number().int().optional() }).parse(req.body ?? {});
    const seed = body.seed ?? Math.floor(Math.random() * 2 ** 31);
    const id = randomUUID().slice(0, 8);
    const state = createGame(content, seed, id);
    state.briefings.push({ month: 0, text: INTRO });
    store.save(state);
    return { gameId: id, view: view(state) };
  });

  app.get('/api/games/:id', async (req) => {
    const { id } = req.params as { id: string };
    return { view: view(game(id)) };
  });

  /* ---------------- meetings ---------------- */

  app.post('/api/games/:id/meetings', async (req) => {
    const { id } = req.params as { id: string };
    const { personId } = z.object({ personId: z.string() }).parse(req.body);
    const state = game(id);
    const meeting = startMeeting(state, content, personId);
    const ctx = buildActorContext(state, content, personId);
    const opening = await orchestrator.actorReply(ctx, [], content);
    meeting.transcript.push({ role: 'npc', text: opening });
    store.save(state);
    return { meetingId: meeting.id, opening, view: view(state) };
  });

  app.post('/api/games/:id/meetings/:mid/messages', async (req, reply) => {
    const { id, mid } = req.params as { id: string; mid: string };
    const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
    const state = game(id);
    const meeting = getMeeting(state, mid);
    if (meeting.concluded) throw new Error('meeting already concluded');
    meeting.transcript.push({ role: 'player', text });
    store.save(state);

    const ctx = buildActorContext(state, content, meeting.personId);
    const wantsStream = (req.headers.accept ?? '').includes('text/event-stream');

    if (!wantsStream) {
      const replyText = await orchestrator.actorReply(ctx, meeting.transcript, content);
      meeting.transcript.push({ role: 'npc', text: replyText });
      store.save(state);
      return { reply: replyText };
    }

    reply.hijack();
    sseHead(reply);
    const send = (event: string, data: unknown) =>
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const replyText = await orchestrator.actorReply(
        ctx, meeting.transcript, content, (t) => send('token', { t }),
      );
      meeting.transcript.push({ role: 'npc', text: replyText });
      store.save(state);
      send('done', { text: replyText });
    } catch (err) {
      send('error', { error: (err as Error).message });
    }
    reply.raw.end();
  });

  app.post('/api/games/:id/meetings/:mid/conclude', async (req) => {
    const { id, mid } = req.params as { id: string; mid: string };
    const state = game(id);
    const meeting = getMeeting(state, mid);
    if (meeting.concluded) throw new Error('meeting already concluded');
    const ctx = buildAdjudicateContext(state, content, meeting.personId);
    const adjudication = await orchestrator.adjudicate(ctx, meeting.transcript, content);
    const { proposedActions, surfaced } = concludeMeeting(state, content, mid, adjudication);
    store.save(state);
    return {
      summary: adjudication.summary,
      surfaced,
      proposedActions: proposedActions.map((a) => ({
        action: a,
        description: describeAction(content, a),
      })),
      view: view(state),
    };
  });

  app.post('/api/games/:id/orders', async (req) => {
    const { id } = req.params as { id: string };
    const { actions } = z.object({ actions: z.array(ActionSchema).max(6) }).parse(req.body);
    const state = game(id);
    const { accusation } = confirmOrders(state, content, actions as Action[]);
    let courtScene: string | undefined;
    if (accusation) {
      courtScene = await orchestrator.renderCourtScene(accusation, content);
    }
    store.save(state);
    return {
      courtScene,
      accusationOutcome: accusation?.outcome,
      view: view(state),
    };
  });

  /* ---------------- solo actions ---------------- */

  app.post('/api/games/:id/study', async (req) => {
    const { id } = req.params as { id: string };
    const state = game(id);
    doStudy(state);
    store.save(state);
    return { view: view(state) };
  });

  app.post('/api/games/:id/leisure', async (req) => {
    const { id } = req.params as { id: string };
    const { kind } = z.object({ kind: z.enum(['hawking', 'feast', 'hunt']) }).parse(req.body);
    const state = game(id);
    const { note } = doLeisure(state, content, kind);
    store.save(state);
    return { note, view: view(state) };
  });

  app.post('/api/games/:id/pins', async (req) => {
    const { id } = req.params as { id: string };
    const { docId, lineId } = z.object({ docId: z.string(), lineId: z.string() }).parse(req.body);
    const state = game(id);
    if (!state.studiedThisMonth) {
      throw new Error('you must spend an afternoon studying the rolls before close comparison');
    }
    const result = togglePin(state, content, docId, lineId);
    store.save(state);
    const surfacedDescriptions = state.evidence
      .filter((e) => result.surfaced.includes(e.id))
      .map((e) => e.description);
    return { pinned: result.pinned, surfaced: surfacedDescriptions, view: view(state) };
  });

  app.post('/api/games/:id/decisions', async (req) => {
    const { id } = req.params as { id: string };
    const { decisionId, response } = z.object({
      decisionId: z.string(),
      response: z.string().min(1).max(2000),
    }).parse(req.body);
    const state = game(id);
    const decision = state.pendingDecisions.find((d) => d.id === decisionId && !d.resolved);
    if (!decision) throw new Error('no such open decision');
    const result = await orchestrator.decide(decision, response, content);
    resolveDecision(state, content, decisionId, result.choice, result.note);
    store.save(state);
    return { choice: result.choice, note: result.note, view: view(state) };
  });

  /* ---------------- the month turns ---------------- */

  app.post('/api/games/:id/end-turn', async (req) => {
    const { id } = req.params as { id: string };
    const state = game(id);
    const tick = advanceMonth(state, content);
    await Promise.all(tick.newDocs.map(async (doc) => {
      doc.prose = await orchestrator.renderDocument(doc, content);
    }));
    const briefingText = await orchestrator.renderBriefing(tick.briefing, content);
    state.briefings.push({ month: state.month, text: briefingText });
    store.save(state);
    return { briefing: briefingText, view: view(state) };
  });

  if (opts.staticRoot) {
    void registerStatic(app, opts.staticRoot);
  }

  return app;
}

function sseHead(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}

async function registerStatic(app: FastifyInstance, root: string): Promise<void> {
  const fastifyStatic = await import('@fastify/static');
  await app.register(fastifyStatic.default, { root });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) reply.code(404).send({ error: 'not found' });
    else reply.sendFile('index.html');
  });
}
