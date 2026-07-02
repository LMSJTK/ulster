import { clampStat, defOf, journal } from './state.js';
import type { ContentPack, GameState } from './types.js';
import { fmtMoney } from './types.js';

export interface AccusationResult {
  outcome: 'exposed' | 'denied' | 'false';
  accusedId: string;
  accusedName: string;
  correct: boolean;
  strength: number;
  citedDescriptions: string[];
  recovered: number;
}

/**
 * The player convenes court and accuses someone. Resolution is deterministic:
 * it weighs only evidence the player has actually surfaced. The DM/Scribe
 * renders the scene; the engine decides it.
 */
export function resolveAccusation(
  state: GameState, content: ContentPack, accusedId: string, citedEvidence: string[],
): AccusationResult {
  const accused = state.persons[accusedId];
  if (!accused) throw new Error(`unknown person ${accusedId}`);
  const accusedName = defOf(content, accusedId).name;

  // Only surfaced evidence counts; cite-all if the extraction came up empty.
  const surfaced = state.evidence.filter((e) => e.surfaced);
  const cited = citedEvidence.length > 0
    ? surfaced.filter((e) => citedEvidence.includes(e.id))
    : surfaced;
  const strength = cited.reduce((sum, e) => sum + e.strength, 0);
  const correct = accusedId === state.plot.schemerId;

  const base: Omit<AccusationResult, 'outcome' | 'recovered'> = {
    accusedId,
    accusedName,
    correct,
    strength,
    citedDescriptions: cited.map((e) => e.description),
  };

  if (correct && strength >= 4) {
    // Exposed: the proof is undeniable.
    state.plot.status = 'exposed';
    const recovered = Math.floor(state.plot.stolenTotal * 0.6);
    state.plot.recovered = recovered;
    state.treasury += recovered;
    accused.loyalty = 0;
    accused.relationship = 0;
    state.reputation = clampStat(state.reputation + 5);
    state.prestige = clampStat(state.prestige + 3);
    for (const p of Object.values(state.persons)) {
      if (p.id === accusedId) continue;
      p.loyalty = clampStat(p.loyalty + 3);
      p.relationship = clampStat(p.relationship + 2);
    }
    journal(state, 'accusation',
      `Confronted with the proofs, ${accusedName} confessed. ${fmtMoney(recovered)} of the stolen ` +
      `${fmtMoney(state.plot.stolenTotal)} was recovered. The council saw that the earl sees clearly.`);
    return { ...base, outcome: 'exposed', recovered };
  }

  if (correct && strength >= 2) {
    // Near miss: he is guilty, but the proof is thin. He weathers it and grows careful.
    state.plot.status = 'paused';
    state.plot.pausedUntil = Math.min(12, state.month + 2);
    state.plot.cautious = true;
    accused.relationship = clampStat(accused.relationship - 10);
    for (const p of Object.values(state.persons)) {
      if (p.id !== accusedId) p.relationship = clampStat(p.relationship - 4);
    }
    state.reputation = clampStat(state.reputation - 2);
    journal(state, 'accusation',
      `The earl accused ${accusedName}, but the proofs were thin and he stood firm. ` +
      'The court murmured. The thief will be more careful now.');
    return { ...base, outcome: 'denied', recovered: 0 };
  }

  // False (wrong man, or near-baseless): the court recoils.
  state.plot.status = state.plot.status === 'exposed' ? 'exposed' : 'paused';
  if (state.plot.status === 'paused') {
    state.plot.pausedUntil = Math.min(12, state.month + 1);
  }
  accused.relationship = clampStat(accused.relationship - 15);
  accused.loyalty = clampStat(accused.loyalty - 10);
  for (const p of Object.values(state.persons)) {
    if (p.id !== accusedId) {
      p.relationship = clampStat(p.relationship - 6);
      p.loyalty = clampStat(p.loyalty - 4);
    }
  }
  state.reputation = clampStat(state.reputation - 4);
  journal(state, 'accusation',
    `The earl accused ${accusedName} without proof. The hall went cold; ` +
    'the household now watches its lord with wary eyes.');
  return { ...base, outcome: 'false', recovered: 0 };
}
