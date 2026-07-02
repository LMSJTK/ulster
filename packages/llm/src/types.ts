import type {
  AccusationResult, ActorContext, AdjudicateContext, Adjudication, ChatMsg,
  ContentPack, DecisionItem, DecisionResult, GameDocument, TickResult,
} from '@redearl/engine';

/**
 * The four LLM jobs, behind one interface. Two implementations:
 * LiveOrchestrator (Anthropic API) and FakeOrchestrator (deterministic
 * scripts) — the fake is both the offline/CI mode and the fallback when a
 * live completion fails validation.
 */
export interface Orchestrator {
  readonly live: boolean;

  /** Actor: one NPC's reply in a meeting. Streams tokens if a sink is given. */
  actorReply(
    ctx: ActorContext,
    transcript: ChatMsg[],
    content: ContentPack,
    onToken?: (t: string) => void,
  ): Promise<string>;

  /** Adjudicator: extract typed orders/disclosures/tone from a finished meeting. */
  adjudicate(
    ctx: AdjudicateContext,
    transcript: ChatMsg[],
    content: ContentPack,
  ): Promise<Adjudication>;

  /** Scribe: period prose around a document's fixed lines and claims. */
  renderDocument(doc: GameDocument, content: ContentPack): Promise<string>;

  /** Scribe: the morning briefing. */
  renderBriefing(briefing: TickResult['briefing'], content: ContentPack): Promise<string>;

  /** DM: give voice to an engine-decided court confrontation. */
  renderCourtScene(result: AccusationResult, content: ContentPack): Promise<string>;

  /** DM: map a free-text answer to a letter onto one of its options. */
  decide(
    decision: DecisionItem,
    responseText: string,
    content: ContentPack,
  ): Promise<DecisionResult>;
}
