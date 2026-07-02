import { z } from 'zod';
import type {
  AccusationResult, Action, ActorContext, AdjudicateContext, Adjudication, ChatMsg,
  ContentPack, DecisionItem, DecisionResult, GameDocument, TickResult,
} from '@redearl/engine';
import { AdjudicationSchema, DecisionResultSchema } from '@redearl/engine';
import { FakeOrchestrator } from './fake.js';
import {
  buildActorSystem, buildAdjudicatorUser, buildBriefingUser, buildCourtSceneUser,
  buildDecisionUser, buildDocumentUser, transcriptToMessages,
} from './prompts.js';
import type { Orchestrator } from './types.js';

/**
 * Minimal client surface so tests can stub the SDK. The real client is an
 * `Anthropic` instance from @anthropic-ai/sdk.
 */
export interface MinimalAnthropicClient {
  messages: {
    create(params: any): Promise<unknown>;
  };
}

export interface LiveModels {
  actor: string;
  small: string;
  dm: string;
}

export const DEFAULT_MODELS: LiveModels = {
  actor: process.env.REDEARL_ACTOR_MODEL ?? 'claude-sonnet-5',
  small: process.env.REDEARL_SMALL_MODEL ?? 'claude-haiku-4-5-20251001',
  dm: process.env.REDEARL_DM_MODEL ?? 'claude-sonnet-5',
};

interface ContentBlock {
  type: string;
  text?: string;
  input?: unknown;
  name?: string;
}

function textOf(response: unknown): string {
  const blocks = (response as { content?: ContentBlock[] }).content ?? [];
  return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
}

function toolInputOf(response: unknown): unknown {
  const blocks = (response as { content?: ContentBlock[] }).content ?? [];
  return blocks.find((b) => b.type === 'tool_use')?.input;
}

/**
 * Live Anthropic-backed orchestrator. Every structured output is
 * schema-validated with one repair-retry; on repeated failure it degrades to
 * the FakeOrchestrator's deterministic path so the game never wedges.
 */
export class LiveOrchestrator implements Orchestrator {
  readonly live = true;
  private fallback = new FakeOrchestrator();

  constructor(
    private client: MinimalAnthropicClient,
    private models: LiveModels = DEFAULT_MODELS,
  ) {}

  async actorReply(
    ctx: ActorContext, transcript: ChatMsg[], content: ContentPack,
    onToken?: (t: string) => void,
  ): Promise<string> {
    try {
      const params = {
        model: this.models.actor,
        max_tokens: 400,
        system: buildActorSystem(ctx, content),
        messages: transcriptToMessages(transcript),
      };
      if (onToken) {
        const stream = (await this.client.messages.create({ ...params, stream: true })) as AsyncIterable<{
          type: string;
          delta?: { type: string; text?: string };
        }>;
        let full = '';
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            full += event.delta.text;
            onToken(event.delta.text);
          }
        }
        if (full.trim().length > 0) return full;
        throw new Error('empty stream');
      }
      const text = textOf(await this.client.messages.create(params));
      if (text.trim().length === 0) throw new Error('empty completion');
      return text;
    } catch {
      const reply = await this.fallback.actorReply(ctx, transcript, content);
      onToken?.(reply);
      return reply;
    }
  }

  async adjudicate(
    ctx: AdjudicateContext, transcript: ChatMsg[], content: ContentPack,
  ): Promise<Adjudication> {
    const tool = {
      name: 'record_meeting',
      description: 'Record the orders, disclosures, and tone of the meeting.',
      input_schema: z.toJSONSchema(AdjudicationSchema),
    };
    const baseMessages = [{ role: 'user' as const, content: buildAdjudicatorUser(ctx, transcript) }];
    const call = (messages: typeof baseMessages) =>
      this.client.messages.create({
        model: this.models.small,
        max_tokens: 1200,
        system: content.prompts.adjudicatorSystem,
        messages,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'record_meeting' },
      });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = toolInputOf(await call(
          attempt === 0
            ? baseMessages
            : [...baseMessages, {
                role: 'user' as const,
                content: 'Your previous record failed validation. Re-record the meeting, strictly matching the schema and using only the ids listed above.',
              }],
        ));
        const parsed = AdjudicationSchema.safeParse(raw);
        if (!parsed.success) continue;
        return this.sanitizeAdjudication(parsed.data, ctx);
      } catch {
        // fall through to retry / fallback
      }
    }
    return this.fallback.adjudicate(ctx, transcript, content);
  }

  /** Referential integrity: extracted ids must exist in the scoped context. */
  private sanitizeAdjudication(adj: Adjudication, ctx: AdjudicateContext): Adjudication {
    const holdingIds = new Set(ctx.holdings.map((h) => h.id));
    const councilIds = new Set(ctx.council.map((c) => c.id));
    const evidenceIds = new Set(ctx.surfacedEvidence.map((e) => e.id));
    const beliefIds = new Set(ctx.candidateBeliefs.map((b) => b.id));

    const actions: Action[] = adj.actions.filter((a) => {
      switch (a.type) {
        case 'request_document': return holdingIds.has(a.holdingId);
        case 'adjust_garrison': return holdingIds.has(a.holdingId);
        case 'accuse': return councilIds.has(a.accusedId);
        case 'grant': return councilIds.has(a.personId);
        default: return true;
      }
    }).map((a) => a.type === 'accuse'
      ? { ...a, citedEvidence: a.citedEvidence.filter((id) => evidenceIds.has(id)) }
      : a);

    return {
      ...adj,
      actions,
      disclosedBeliefs: adj.disclosedBeliefs.filter((id) => beliefIds.has(id)),
    };
  }

  async renderDocument(doc: GameDocument, content: ContentPack): Promise<string> {
    return this.prose(this.models.small, content.prompts.scribeSystem, buildDocumentUser(doc, content), 350)
      .catch(() => this.fallback.renderDocument(doc, content));
  }

  async renderBriefing(briefing: TickResult['briefing'], content: ContentPack): Promise<string> {
    return this.prose(this.models.small, content.prompts.scribeSystem, buildBriefingUser(briefing), 350)
      .catch(() => this.fallback.renderBriefing(briefing, content));
  }

  async renderCourtScene(result: AccusationResult, content: ContentPack): Promise<string> {
    return this.prose(this.models.dm, content.prompts.dmSystem, buildCourtSceneUser(result), 600)
      .catch(() => this.fallback.renderCourtScene(result, content));
  }

  async decide(
    decision: DecisionItem, responseText: string, content: ContentPack,
  ): Promise<DecisionResult> {
    try {
      const raw = toolInputOf(await this.client.messages.create({
        model: this.models.small,
        max_tokens: 400,
        system: content.prompts.dmSystem,
        messages: [{ role: 'user', content: buildDecisionUser(decision, responseText) }],
        tools: [{
          name: 'record_decision',
          description: 'Record which course the earl chose.',
          input_schema: z.toJSONSchema(DecisionResultSchema),
        }],
        tool_choice: { type: 'tool', name: 'record_decision' },
      }));
      const parsed = DecisionResultSchema.safeParse(raw);
      if (parsed.success) {
        const valid = decision.options.some((o) => o.id === parsed.data.choice) || parsed.data.choice === 'defer';
        if (valid) return parsed.data;
      }
    } catch {
      // fall through
    }
    return this.fallback.decide(decision, responseText, content);
  }

  private async prose(model: string, system: string, user: string, maxTokens: number): Promise<string> {
    const text = textOf(await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }));
    if (text.trim().length === 0) throw new Error('empty completion');
    return text.trim();
  }
}
