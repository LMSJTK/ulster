import { derive, rngInt, rngPickN } from './rng.js';
import type {
  Belief, ContentPack, GameState, HoldingState, JournalKind, PersonState, PlotState,
} from './types.js';
import { MONTHS } from './types.js';

export function journal(state: GameState, kind: JournalKind, text: string, secret = false): void {
  state.journal.push({ month: state.month, kind, text, secret });
}

export function personByOffice(state: GameState, content: ContentPack, office: string): PersonState {
  const def = content.persons.find((p) => p.office === office);
  if (!def) throw new Error(`no person with office ${office}`);
  return state.persons[def.id];
}

export function defOf(content: ContentPack, personId: string) {
  const def = content.persons.find((p) => p.id === personId);
  if (!def) throw new Error(`unknown person ${personId}`);
  return def;
}

export function holdingDef(content: ContentPack, holdingId: string) {
  const def = content.holdings.find((h) => h.id === holdingId);
  if (!def) throw new Error(`unknown holding ${holdingId}`);
  return def;
}

export function monthLabel(content: ContentPack, month: number): string {
  return `${MONTHS[month]} ${content.meta.year}`;
}

/**
 * Create a new game. Deterministic for a given seed: entity dispositions,
 * plot targets, and the whole year's random events derive from it.
 */
export function createGame(content: ContentPack, seed: number, id: string): GameState {
  const rng = derive(seed, 'create');

  const persons: Record<string, PersonState> = {};
  for (const def of content.persons) {
    const beliefs: Belief[] = def.startingBeliefs.map((text, i) => ({
      id: `${def.id}_start_${i}`,
      text,
      sensitivity: 'open',
    }));
    persons[def.id] = {
      id: def.id,
      loyalty: rngInt(rng, 50, 75),
      relationship: rngInt(rng, 48, 62),
      beliefs,
      agendaDirectives: [],
    };
  }

  const holdings: Record<string, HoldingState> = {};
  for (const def of content.holdings) {
    holdings[def.id] = {
      id: def.id,
      condition: rngInt(rng, 82, 100),
      garrison: def.startingGarrison,
      trueReceipts: Array(12).fill(null),
      reportedReceipts: Array(12).fill(null),
    };
  }

  const plot = instantiatePlot(content, seed, persons);

  const state: GameState = {
    id,
    seed,
    month: 0,
    year: content.meta.year,
    slots: 3,
    studiedThisMonth: false,
    over: false,
    treasury: content.startingTreasury,
    prestige: 10,
    reputation: 10,
    persons,
    holdings,
    plot,
    documents: [],
    evidence: [],
    pins: [],
    pendingActions: [],
    pendingDecisions: [],
    meetings: [],
    briefings: [],
    journal: [],
    flags: {},
  };

  // Pre-planted evidence: witness testimony and lifestyle rumor exist in the
  // world from the plot's schedule; they surface only through play.
  const t = content.plot;
  state.evidence.push({
    id: 'ev_testimony',
    kind: 'testimony',
    description: t.witnessBelief,
    strength: 2,
    surfaced: false,
    month: t.witnessMonth,
  });
  state.evidence.push({
    id: 'ev_rumor',
    kind: 'rumor',
    description: t.rumorText,
    strength: 1,
    surfaced: false,
    month: t.rumorMonth,
  });

  journal(state, 'system',
    `${content.meta.playerName} takes up residence at ${content.meta.seat}, ${MONTHS[0]} ${content.meta.year}.`);
  journal(state, 'skim',
    `${defOf(content, plot.schemerId).name} resolves to skim the receipts of ` +
    `${plot.targetHoldings.map((h) => holdingDef(content, h).name).join(' and ')}.`,
    true);

  return state;
}

function instantiatePlot(
  content: ContentPack,
  seed: number,
  persons: Record<string, PersonState>,
): PlotState {
  const rng = derive(seed, 'plot');
  const t = content.plot;
  const schemerDef = content.persons.find((p) => p.office === t.schemerOffice);
  if (!schemerDef) throw new Error(`plot schemer office ${t.schemerOffice} not in content`);

  // Target the richer non-seat manors more often: weight by base revenue.
  const eligible = content.holdings.filter((h) => h.id !== seatId(content));
  const targets = rngPickN(rng, eligible, t.targetCount).map((h) => h.id);
  const targetNames = targets.map((id) => holdingDef(content, id).name);

  persons[schemerDef.id].agendaDirectives = t.directives(targetNames);

  return {
    templateId: t.id,
    schemerId: schemerDef.id,
    targetHoldings: targets,
    schedule: t.schedule,
    status: 'active',
    cautious: false,
    stolenTotal: 0,
    recovered: 0,
  };
}

export function seatId(content: ContentPack): string {
  const seat = content.holdings.find((h) => h.name === content.meta.seat);
  return seat ? seat.id : content.holdings[0].id;
}

/** Current skim rate (per-mille) for a month under the plot schedule. */
export function skimRate(plot: PlotState, month: number): number {
  if (plot.status !== 'active') return 0;
  if (plot.pausedUntil !== undefined && month < plot.pausedUntil) return 0;
  let rate = 0;
  for (const step of plot.schedule) {
    if (month >= step.from) rate = step.rate;
  }
  return plot.cautious ? Math.floor(rate / 2) : rate;
}

export function addBelief(state: GameState, personId: string, belief: Belief): void {
  const p = state.persons[personId];
  if (!p.beliefs.some((b) => b.id === belief.id)) p.beliefs.push(belief);
}

export function clampStat(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}
