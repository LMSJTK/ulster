import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Money. All amounts are integer shillings (20s = £1).
 * ------------------------------------------------------------------ */

export function fmtMoney(shillings: number): string {
  const neg = shillings < 0;
  const s = Math.abs(Math.round(shillings));
  const pounds = Math.floor(s / 20);
  const rem = s % 20;
  let core: string;
  if (pounds > 0 && rem > 0) core = `£${pounds} ${rem}s`;
  else if (pounds > 0) core = `£${pounds}`;
  else core = `${rem}s`;
  return neg ? `−${core}` : core;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/* ------------------------------------------------------------------ *
 * Content-pack definitions (static data supplied by a setting pack).
 * The engine knows offices, holdings, documents, plots — not Ulster.
 * ------------------------------------------------------------------ */

export interface PersonDef {
  id: string;
  name: string;
  /** Engine-meaningful role key, e.g. 'seneschal' | 'chamberlain' | 'constable' | 'clerk'. */
  office: string;
  title: string;
  /** Persona text for the Actor prompt. */
  persona: string;
  /** Style/voice notes for the Actor prompt. */
  voice: string;
  competence: number; // 0..1, drives report noise
  /** Open beliefs the person starts the game with (world knowledge for their office). */
  startingBeliefs: string[];
  /** Canned lines the FakeOrchestrator can draw on. */
  smallTalk: string[];
}

export interface HoldingDef {
  id: string;
  name: string;
  region: string;
  bailiff: string;
  /** Baseline monthly revenue in shillings, before seasonal curve and condition. */
  baseRevenue: number;
  /** March holdings are exposed to raids. */
  march: boolean;
  startingGarrison: number;
}

export interface ScriptedEventDef {
  id: string;
  kind: 'summons' | 'murrain' | 'storm';
  /** Month index 0..11, or 'random' (seeded into months 1..9). */
  month: number | 'random';
  /** Free-text used in generated letters/reports. */
  text: string;
}

export interface PlotTemplate {
  id: string;
  schemerOffice: string;
  /** Number of holdings targeted by the skim. */
  targetCount: number;
  /** Skim schedule: from month N (inclusive) apply rate in per-mille of receipts. */
  schedule: { from: number; rate: number }[];
  witnessOffice: string;
  /** Month the witness notices something. */
  witnessMonth: number;
  /** Month from which the lifestyle rumor can surface during leisure. */
  rumorMonth: number;
  /** Text of the witness's guarded belief. */
  witnessBelief: string;
  /** Description shown when the rumor evidence surfaces. */
  rumorText: string;
  /** Secret Actor directives for the schemer, given target holding names. */
  directives: (targetNames: string[]) => string[];
}

export interface ContentPack {
  meta: {
    title: string;
    /** How NPCs address the player. */
    playerTitle: string;
    playerName: string;
    seat: string;
    year: number;
  };
  persons: PersonDef[];
  holdings: HoldingDef[];
  startingTreasury: number;
  monthlyExpenses: number;
  /** 12 seasonal revenue factors, Jan..Dec. */
  seasonalCurve: number[];
  raid: {
    chancePerMonth: number;
    /** Condition damage range on a raided holding. */
    damage: [number, number];
    raiderName: string;
  };
  scriptedEvents: ScriptedEventDef[];
  plot: PlotTemplate;
  prompts: {
    actorSystem: string;
    adjudicatorSystem: string;
    scribeSystem: string;
    dmSystem: string;
  };
}

/* ------------------------------------------------------------------ *
 * Runtime state.
 * ------------------------------------------------------------------ */

export interface Belief {
  id: string;
  text: string;
  /** 'open' beliefs are volunteered freely; 'guarded' only under trust or direct questions. */
  sensitivity: 'open' | 'guarded';
  /** If disclosing this belief should surface a piece of evidence. */
  evidenceId?: string;
}

export interface PersonState {
  id: string;
  loyalty: number; // 0..100, hidden from player
  relationship: number; // 0..100 with the player
  beliefs: Belief[];
  /** Secret instructions merged into the Actor prompt (schemer only, in the slice). */
  agendaDirectives: string[];
}

export interface HoldingState {
  id: string;
  condition: number; // 0..100
  garrison: number;
  /** True receipts by month index (what the manor actually rendered). */
  trueReceipts: (number | null)[];
  /** Receipts as reported in the receiver's roll by month index. */
  reportedReceipts: (number | null)[];
}

export interface DocLine {
  id: string;
  label: string;
  value?: number; // shillings
  note?: string;
}

export type DocKind =
  | 'receivers_roll'
  | 'bailiff_receipts'
  | 'audit_report'
  | 'seneschal_report'
  | 'garrison_report'
  | 'letter'
  | 'note';

export interface GameDocument {
  id: string;
  kind: DocKind;
  title: string;
  /** Person the document came from ('' for external letters). */
  sourceId: string;
  /** Month the document's figures refer to (for rolls/receipts). */
  month: number;
  /** Month the player received it. */
  deliveredMonth: number;
  lines: DocLine[];
  claims: string[];
  /** Prose rendered by the Scribe (or the plain fallback). */
  prose: string;
}

export interface EvidenceItem {
  id: string;
  kind: 'discrepancy' | 'testimony' | 'rumor';
  description: string;
  strength: number;
  surfaced: boolean;
  /** Month the evidence came into existence in the world. */
  month: number;
  docRefs?: {
    a: { docId: string; lineId: string };
    b: { docId: string; lineId: string };
  };
}

export interface Pin {
  docId: string;
  lineId: string;
}

export interface PlotState {
  templateId: string;
  schemerId: string;
  targetHoldings: string[];
  schedule: { from: number; rate: number }[];
  status: 'active' | 'paused' | 'exposed';
  /** When paused: month index at which the skim resumes. */
  pausedUntil?: number;
  /** After a near-miss accusation the schemer gets cautious: rates halved. */
  cautious: boolean;
  stolenTotal: number;
  recovered: number;
}

export type ChatRole = 'player' | 'npc';

export interface ChatMsg {
  role: ChatRole;
  text: string;
}

export interface MeetingRecord {
  id: string;
  personId: string;
  month: number;
  transcript: ChatMsg[];
  concluded: boolean;
  summary?: string;
}

export interface DecisionItem {
  id: string;
  /** Document that carries the letter/petition. */
  docId: string;
  prompt: string;
  options: { id: string; label: string }[];
  /** Month it must be answered by (auto-resolves after). */
  deadline: number;
  resolved?: string;
}

export type JournalKind =
  | 'system' | 'revenue' | 'skim' | 'event' | 'order' | 'meeting'
  | 'evidence' | 'decision' | 'accusation' | 'leisure' | 'ending';

export interface JournalEntry {
  month: number;
  kind: JournalKind;
  text: string;
  /** Ground-truth entries appear in the end-of-game reveal. */
  secret: boolean;
}

export type EndingKind = 'justice' | 'audit';

export interface GameState {
  id: string;
  seed: number;
  month: number; // 0..11
  year: number;
  slots: number;
  studiedThisMonth: boolean;
  over: boolean;
  ending?: EndingKind;
  epilogue?: string;
  treasury: number;
  prestige: number;
  reputation: number;
  troopsAwayUntil?: number;
  persons: Record<string, PersonState>;
  holdings: Record<string, HoldingState>;
  plot: PlotState;
  documents: GameDocument[];
  evidence: EvidenceItem[];
  pins: Pin[];
  pendingActions: Action[];
  pendingDecisions: DecisionItem[];
  meetings: MeetingRecord[];
  /** Rendered monthly briefings, newest last. */
  briefings: { month: number; text: string }[];
  journal: JournalEntry[];
  flags: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ *
 * Actions — the typed schema the Adjudicator extracts into.
 * Zod schemas double as LLM tool definitions (via z.toJSONSchema).
 * ------------------------------------------------------------------ */

export const BoundedEffectSchema = z.object({
  kind: z.enum(['treasury', 'loyalty', 'relationship', 'condition', 'reputation', 'prestige']),
  targetId: z.string().optional().describe('Person or holding id the effect applies to, if any'),
  delta: z.number().int().describe('Signed magnitude; the engine clamps per category'),
});
export type BoundedEffect = z.infer<typeof BoundedEffectSchema>;

/** Per-category caps enforced by the engine on freeform effects. */
export const EFFECT_CAPS: Record<BoundedEffect['kind'], number> = {
  treasury: 100,
  loyalty: 8,
  relationship: 8,
  condition: 10,
  reputation: 5,
  prestige: 5,
};

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('request_document'),
    docKind: z.literal('bailiff_receipts'),
    holdingId: z.string().describe('The holding whose bailiff should send his receipts'),
  }),
  z.object({
    type: z.literal('order_audit'),
  }).describe('Dispatch the clerk to collect true receipts from every manor for recent months'),
  z.object({
    type: z.literal('accuse'),
    accusedId: z.string(),
    citedEvidence: z.array(z.string()).describe('Ids of surfaced evidence the player relies on'),
  }),
  z.object({
    type: z.literal('adjust_garrison'),
    holdingId: z.string(),
    delta: z.number().int().min(-20).max(20).describe('Spears moved from/to the seat garrison'),
  }),
  z.object({
    type: z.literal('grant'),
    personId: z.string(),
    amount: z.number().int().min(1).max(400).describe('Gift in shillings'),
  }),
  z.object({
    type: z.literal('freeform'),
    description: z.string(),
    effects: z.array(BoundedEffectSchema).max(3),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const AdjudicationSchema = z.object({
  actions: z.array(ActionSchema).max(6).describe('Concrete orders the player gave in this meeting'),
  disclosedBeliefs: z.array(z.string()).max(10)
    .describe('Ids of the candidate beliefs the NPC actually revealed during the conversation'),
  tone: z.number().int().min(-2).max(2)
    .describe("The player's manner toward the NPC: -2 abusive .. 0 neutral .. +2 warm/generous"),
  summary: z.string().describe('One-sentence summary of the meeting'),
});
export type Adjudication = z.infer<typeof AdjudicationSchema>;

export const DecisionResultSchema = z.object({
  choice: z.string().describe('Id of the option that best matches the response'),
  note: z.string().describe('Short narration of how the response is carried out'),
});
export type DecisionResult = z.infer<typeof DecisionResultSchema>;

/* ------------------------------------------------------------------ *
 * Player view — the ONLY shape that crosses the wire to the client.
 * Contains the player's epistemic state; never ground truth.
 * ------------------------------------------------------------------ */

export interface CouncilMemberView {
  id: string;
  name: string;
  title: string;
  office: string;
  /** Verbal impression, not a number the player couldn't know. */
  disposition: string;
}

export interface EvidenceView {
  id: string;
  kind: EvidenceItem['kind'];
  description: string;
  strength: number;
}

export interface RevealView {
  ending: EndingKind;
  epilogue: string;
  stolenTotal: number;
  recovered: number;
  timeline: { month: number; text: string }[];
}

export interface PlayerView {
  id: string;
  monthName: string;
  month: number;
  year: number;
  slots: number;
  studiedThisMonth: boolean;
  treasury: number;
  treasuryLabel: string;
  prestige: number;
  reputation: number;
  council: CouncilMemberView[];
  documents: GameDocument[];
  pins: Pin[];
  evidence: EvidenceView[];
  pendingDecisions: DecisionItem[];
  meetings: MeetingRecord[];
  briefings: { month: number; text: string }[];
  over: boolean;
  reveal?: RevealView;
}
