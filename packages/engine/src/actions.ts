import { makeNote } from './documents.js';
import { derive, rngChance, rngPick } from './rng.js';
import { clampStat, defOf, holdingDef, journal, seatId } from './state.js';
import type {
  Action, Adjudication, ContentPack, GameState, MeetingRecord,
} from './types.js';
import { EFFECT_CAPS, fmtMoney } from './types.js';
import { resolveAccusation, type AccusationResult } from './accusation.js';

function spendSlot(state: GameState): void {
  if (state.over) throw new Error('the game is over');
  if (state.slots <= 0) throw new Error('no time left this month');
  state.slots -= 1;
}

/* ------------------------------------------------------------------ *
 * Meetings.
 * ------------------------------------------------------------------ */

export function startMeeting(state: GameState, content: ContentPack, personId: string): MeetingRecord {
  defOf(content, personId); // validate
  spendSlot(state);
  const meeting: MeetingRecord = {
    id: `meet_${state.meetings.length}`,
    personId,
    month: state.month,
    transcript: [],
    concluded: false,
  };
  state.meetings.push(meeting);
  journal(state, 'meeting', `The earl summoned ${defOf(content, personId).name}.`);
  return meeting;
}

export function getMeeting(state: GameState, meetingId: string): MeetingRecord {
  const m = state.meetings.find((x) => x.id === meetingId);
  if (!m) throw new Error(`unknown meeting ${meetingId}`);
  return m;
}

/**
 * Apply the Adjudicator's read of a concluded meeting: tone shifts the
 * relationship; disclosed guarded beliefs surface their linked evidence.
 * Returns the extracted actions for the player to confirm.
 */
export function concludeMeeting(
  state: GameState, content: ContentPack, meetingId: string, adjudication: Adjudication,
): { proposedActions: Action[]; surfaced: string[] } {
  const meeting = getMeeting(state, meetingId);
  if (meeting.concluded) throw new Error('meeting already concluded');
  meeting.concluded = true;
  meeting.summary = adjudication.summary;

  const person = state.persons[meeting.personId];
  person.relationship = clampStat(person.relationship + adjudication.tone * 3);
  person.loyalty = clampStat(person.loyalty + adjudication.tone);

  const surfaced: string[] = [];
  for (const beliefId of adjudication.disclosedBeliefs) {
    const belief = person.beliefs.find((b) => b.id === beliefId);
    if (!belief?.evidenceId) continue;
    const ev = state.evidence.find((e) => e.id === belief.evidenceId);
    if (ev && !ev.surfaced) {
      ev.surfaced = true;
      surfaced.push(ev.id);
      journal(state, 'evidence',
        `${defOf(content, person.id).name} confided: ${ev.description}`);
    }
  }
  journal(state, 'meeting', `Meeting with ${defOf(content, person.id).name}: ${adjudication.summary}`);
  return { proposedActions: adjudication.actions, surfaced };
}

/**
 * The player confirmed the read-back orders. Accusations resolve immediately
 * (court is convened); everything else queues for the month's end.
 */
export function confirmOrders(
  state: GameState, content: ContentPack, actions: Action[],
): { accusation?: AccusationResult } {
  let accusation: AccusationResult | undefined;
  for (const action of actions) {
    if (action.type === 'accuse') {
      accusation = resolveAccusation(state, content, action.accusedId, action.citedEvidence);
    } else {
      state.pendingActions.push(action);
      journal(state, 'order', describeAction(content, action));
    }
  }
  return { accusation };
}

export function describeAction(content: ContentPack, action: Action): string {
  switch (action.type) {
    case 'request_document':
      return `Ordered: the bailiff of ${holdingDef(content, action.holdingId).name} is to send his receipts.`;
    case 'order_audit':
      return 'Ordered: the clerk is to ride the manors and take true tallies.';
    case 'adjust_garrison':
      return `Ordered: ${Math.abs(action.delta)} spears ${action.delta >= 0 ? 'to' : 'from'} ${holdingDef(content, action.holdingId).name}.`;
    case 'grant':
      return `Granted ${fmtMoney(action.amount)} to ${defOf(content, action.personId).name}.`;
    case 'freeform':
      return `Ordered: ${action.description}`;
    case 'accuse':
      return `Accused ${defOf(content, action.accusedId).name}.`;
  }
}

/** Apply a queued (non-accusation) action during the tick, with caps enforced. */
export function applyQueuedAction(
  state: GameState, content: ContentPack, action: Action, notes: string[],
): void {
  switch (action.type) {
    case 'adjust_garrison': {
      const seat = state.holdings[seatId(content)];
      const target = state.holdings[action.holdingId];
      if (target === seat) return;
      const delta = Math.max(-target.garrison, Math.min(action.delta, seat.garrison));
      seat.garrison -= delta;
      target.garrison += delta;
      notes.push(`${Math.abs(delta)} spears now ${delta >= 0 ? 'strengthen' : 'have left'} ${holdingDef(content, action.holdingId).name}.`);
      break;
    }
    case 'grant': {
      state.treasury -= action.amount;
      const p = state.persons[action.personId];
      if (p) {
        p.relationship = clampStat(p.relationship + Math.min(8, 2 + Math.floor(action.amount / 40)));
        p.loyalty = clampStat(p.loyalty + Math.min(6, Math.floor(action.amount / 60)));
        notes.push(`${defOf(content, action.personId).name} received the earl's gift of ${fmtMoney(action.amount)}.`);
      }
      break;
    }
    case 'freeform': {
      for (const eff of action.effects) {
        const cap = EFFECT_CAPS[eff.kind];
        const delta = Math.max(-cap, Math.min(cap, eff.delta));
        switch (eff.kind) {
          case 'treasury': state.treasury += delta; break;
          case 'reputation': state.reputation = clampStat(state.reputation + delta); break;
          case 'prestige': state.prestige = clampStat(state.prestige + delta); break;
          case 'loyalty': case 'relationship': {
            const p = eff.targetId ? state.persons[eff.targetId] : undefined;
            if (p) p[eff.kind] = clampStat(p[eff.kind] + delta);
            break;
          }
          case 'condition': {
            const h = eff.targetId ? state.holdings[eff.targetId] : undefined;
            if (h) h.condition = clampStat(h.condition + delta);
            break;
          }
        }
      }
      notes.push(`Done as ordered: ${action.description}`);
      journal(state, 'order', `Carried out: ${action.description}`);
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Study and leisure — the diligence/delight trade.
 * ------------------------------------------------------------------ */

/** Spend an afternoon with the rolls: unlocks line-pinning for the month. */
export function doStudy(state: GameState): void {
  if (state.studiedThisMonth) throw new Error('you have already studied the rolls this month');
  spendSlot(state);
  state.studiedThisMonth = true;
  journal(state, 'order', 'The earl spent the afternoon among the rolls and tallies.');
}

export type LeisureKind = 'hawking' | 'feast' | 'hunt';

export function doLeisure(
  state: GameState, content: ContentPack, kind: LeisureKind,
): { note: string } {
  spendSlot(state);
  const count = Number(state.flags.leisureCount ?? 0);
  state.flags.leisureCount = count + 1;
  const rng = derive(state.seed, 'leisure', state.month, count);

  let note: string;
  if (kind === 'feast') {
    state.treasury -= 40;
    state.prestige = clampStat(state.prestige + 3);
    for (const p of Object.values(state.persons)) p.relationship = clampStat(p.relationship + 2);
    note = 'The hall was lit and loud; the household will speak of the earl\'s table for a season.';
  } else {
    state.prestige = clampStat(state.prestige + 2);
    const lucky = rngPick(rng, content.persons);
    state.persons[lucky.id].relationship = clampStat(state.persons[lucky.id].relationship + 3);
    note = kind === 'hawking'
      ? `A fine day on the shore meadows; ${lucky.name} rode at your side and was glad of it.`
      : `The hunt ran long through the woods; ${lucky.name} shared the kill and the earl's wine.`;
  }
  journal(state, 'leisure', note);

  // Courtiers talk when the lord is at ease: the lifestyle rumor can surface.
  const rumor = state.evidence.find((e) => e.id === 'ev_rumor');
  if (
    rumor && !rumor.surfaced && state.month >= rumor.month &&
    (rngChance(rng, 0.45) || state.month >= rumor.month + 3)
  ) {
    rumor.surfaced = true;
    const doc = makeNote(state, `note_rumor_m${state.month}`, 'Overheard at leisure', rumor.description);
    state.documents.push(doc);
    journal(state, 'evidence', `Idle talk reached the earl: ${rumor.description}`);
    note += ` — And idle talk reached your ear: ${rumor.description}`;
  }
  return { note };
}

/* ------------------------------------------------------------------ *
 * Decisions (letters that demand an answer).
 * ------------------------------------------------------------------ */

export function resolveDecision(
  state: GameState, content: ContentPack, decisionId: string, choice: string, note: string,
): void {
  const d = state.pendingDecisions.find((x) => x.id === decisionId);
  if (!d || d.resolved) throw new Error('no such open decision');
  d.resolved = choice;

  switch (choice) {
    case 'send_troops': {
      state.treasury -= 400;
      state.prestige = clampStat(state.prestige + 6);
      state.reputation = clampStat(state.reputation + 8);
      state.troopsAwayUntil = Math.min(12, state.month + 3);
      const constable = content.persons.find((p) => p.office === 'constable');
      if (constable) {
        state.persons[constable.id].loyalty = clampStat(state.persons[constable.id].loyalty + 3);
        state.persons[constable.id].relationship = clampStat(state.persons[constable.id].relationship + 3);
      }
      journal(state, 'decision', 'The earl sent men to the king\'s war in Scotland. The marches stand thinner for it.');
      break;
    }
    case 'pay_fine': {
      state.treasury -= 300;
      state.reputation = clampStat(state.reputation - 2);
      journal(state, 'decision', 'The earl paid a fine in lieu of service in Scotland.');
      break;
    }
    case 'refuse': {
      state.reputation = clampStat(state.reputation - 8);
      state.flags.defiedCrown = true;
      journal(state, 'decision', 'The earl refused the king\'s summons. Dublin will remember.');
      break;
    }
    default: {
      d.resolved = undefined; // defer: keep it pending
      journal(state, 'decision', 'The earl set the king\'s letter aside for now.');
      return;
    }
  }
  if (note) journal(state, 'decision', note);
  state.pendingDecisions = state.pendingDecisions.filter((x) => !x.resolved);
}
