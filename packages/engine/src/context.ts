import { defOf, holdingDef } from './state.js';
import type { ContentPack, GameState } from './types.js';
import { MONTHS } from './types.js';

/**
 * Knowledge scoping (design pillar P3): these context builders decide exactly
 * what world data reaches an LLM prompt. An Actor gets one NPC's beliefs and
 * secrets — never ground truth, never another NPC's knowledge.
 */

export interface ActorContext {
  personId: string;
  name: string;
  title: string;
  office: string;
  persona: string;
  voice: string;
  playerTitle: string;
  playerName: string;
  date: string;
  /** How the NPC currently feels about the player, in words. */
  disposition: string;
  beliefs: { id: string; text: string; sensitivity: 'open' | 'guarded' }[];
  /** Secret agenda directives (schemer only). */
  agendaDirectives: string[];
  smallTalk: string[];
}

export interface AdjudicateContext {
  actorName: string;
  actorId: string;
  council: { id: string; name: string; office: string }[];
  holdings: { id: string; name: string }[];
  surfacedEvidence: { id: string; description: string }[];
  /** Guarded beliefs the NPC might have disclosed; the adjudicator marks which. */
  candidateBeliefs: { id: string; text: string }[];
}

export function dispositionWord(relationship: number): string {
  if (relationship >= 80) return 'devoted';
  if (relationship >= 65) return 'warm';
  if (relationship >= 45) return 'cordial';
  if (relationship >= 30) return 'cool';
  return 'hostile';
}

export function buildActorContext(
  state: GameState, content: ContentPack, personId: string,
): ActorContext {
  const def = defOf(content, personId);
  const p = state.persons[personId];
  return {
    personId,
    name: def.name,
    title: def.title,
    office: def.office,
    persona: def.persona,
    voice: def.voice,
    playerTitle: content.meta.playerTitle,
    playerName: content.meta.playerName,
    date: `${MONTHS[state.month]} ${state.year}`,
    disposition: dispositionWord(p.relationship),
    beliefs: p.beliefs.map((b) => ({ id: b.id, text: b.text, sensitivity: b.sensitivity })),
    agendaDirectives: [...p.agendaDirectives],
    smallTalk: def.smallTalk,
  };
}

export function buildAdjudicateContext(
  state: GameState, content: ContentPack, personId: string,
): AdjudicateContext {
  const def = defOf(content, personId);
  const p = state.persons[personId];
  return {
    actorName: def.name,
    actorId: personId,
    council: content.persons.map((c) => ({ id: c.id, name: c.name, office: c.office })),
    holdings: content.holdings.map((h) => ({ id: h.id, name: h.name })),
    surfacedEvidence: state.evidence
      .filter((e) => e.surfaced)
      .map((e) => ({ id: e.id, description: e.description })),
    candidateBeliefs: p.beliefs
      .filter((b) => b.sensitivity === 'guarded')
      .map((b) => ({ id: b.id, text: b.text })),
  };
}
