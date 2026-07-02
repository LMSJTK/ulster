import { dispositionWord } from './context.js';
import type { ContentPack, GameState, PlayerView, RevealView } from './types.js';
import { fmtMoney, MONTHS } from './types.js';

/**
 * The player-view projection: the ONLY state shape that crosses the wire.
 * It contains the player's epistemic world — documents received, evidence
 * surfaced, impressions of people — and none of the ground truth.
 */
export function buildPlayerView(state: GameState, content: ContentPack): PlayerView {
  return {
    id: state.id,
    monthName: `${MONTHS[state.month]} ${state.year}`,
    month: state.month,
    year: state.year,
    slots: state.slots,
    studiedThisMonth: state.studiedThisMonth,
    treasury: state.treasury,
    treasuryLabel: fmtMoney(state.treasury),
    prestige: state.prestige,
    reputation: state.reputation,
    council: content.persons.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      office: p.office,
      disposition: dispositionWord(state.persons[p.id].relationship),
    })),
    documents: state.documents,
    pins: state.pins,
    evidence: state.evidence
      .filter((e) => e.surfaced)
      .map((e) => ({ id: e.id, kind: e.kind, description: e.description, strength: e.strength })),
    pendingDecisions: state.pendingDecisions.filter((d) => !d.resolved),
    meetings: state.meetings,
    briefings: state.briefings,
    over: state.over,
    reveal: state.over ? buildReveal(state, content) : undefined,
  };
}

/** The end-of-game reveal: replay the hidden journal. */
export function buildReveal(state: GameState, content: ContentPack): RevealView {
  const ending = state.ending ?? 'audit';
  const schemer = content.persons.find((p) => p.id === state.plot.schemerId);
  const stolen = state.plot.stolenTotal;
  const kept = stolen - state.plot.recovered;

  let epilogue: string;
  if (ending === 'justice') {
    epilogue =
      `You caught him. ${schemer?.name ?? 'The receiver'} skimmed ${fmtMoney(stolen)} from your manors ` +
      `before your proofs broke him; ${fmtMoney(state.plot.recovered)} came back to the coffers. ` +
      'Dublin noted the earldom\'s accounts in good order — and noted, too, that the Red Earl reads his rolls.';
  } else {
    epilogue =
      `You never caught him. ${schemer?.name ?? 'The receiver'} took ${fmtMoney(stolen)} over the year` +
      (kept > 0 ? `, and keeps ${fmtMoney(kept)} of it still.` : '.') +
      ' The exchequer\'s letter said what your own paperwork had been whispering all along, had you listened.';
    if (state.flags.defiedCrown) {
      epilogue += ' Your refusal of the king\'s summons did not help your standing in Dublin.';
    }
  }

  const timeline = state.journal
    .filter((j) => j.kind !== 'revenue')
    .map((j) => ({
      month: j.month,
      text: `${MONTHS[Math.min(11, j.month)]}: ${j.text}`,
    }));

  return {
    ending,
    epilogue,
    stolenTotal: stolen,
    recovered: state.plot.recovered,
    timeline,
  };
}
