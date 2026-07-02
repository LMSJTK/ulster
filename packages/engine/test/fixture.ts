import type { ContentPack } from '../src/index.js';

/** Minimal deterministic content pack for engine tests. */
export const testPack: ContentPack = {
  meta: {
    title: 'Test Barony',
    playerTitle: 'my lord',
    playerName: 'The Baron',
    seat: 'Keepton',
    year: 1300,
  },
  persons: [
    {
      id: 'sen', name: 'Sen', office: 'seneschal', title: 'Seneschal',
      persona: 'seneschal', voice: 'plain', competence: 1.0,
      startingBeliefs: ['The manors are quiet.'], smallTalk: ['All quiet.'],
    },
    {
      id: 'cham', name: 'Cham', office: 'chamberlain', title: 'Receiver',
      persona: 'receiver', voice: 'smooth', competence: 1.0,
      startingBeliefs: ['The rolls pass through me.'], smallTalk: ['Rolls in order.'],
    },
    {
      id: 'con', name: 'Con', office: 'constable', title: 'Constable',
      persona: 'constable', voice: 'gruff', competence: 1.0,
      startingBeliefs: ['The walls stand.'], smallTalk: ['Walls stand.'],
    },
    {
      id: 'clerk', name: 'Clerk', office: 'clerk', title: 'Clerk',
      persona: 'clerk', voice: 'soft', competence: 1.0,
      startingBeliefs: ['I copy the rolls.'], smallTalk: ['Ink is cold.'],
    },
  ],
  holdings: [
    { id: 'keepton', name: 'Keepton', region: 'seat', bailiff: 'Reeve A', baseRevenue: 300, march: false, startingGarrison: 40 },
    { id: 'northfield', name: 'Northfield', region: 'north', bailiff: 'Reeve B', baseRevenue: 200, march: true, startingGarrison: 8 },
    { id: 'southmead', name: 'Southmead', region: 'south', bailiff: 'Reeve C', baseRevenue: 200, march: false, startingGarrison: 4 },
  ],
  startingTreasury: 1000,
  monthlyExpenses: 400,
  seasonalCurve: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  raid: { chancePerMonth: 0, damage: [0, 0], raiderName: 'raiders' },
  scriptedEvents: [],
  plot: {
    id: 'test-skim',
    schemerOffice: 'chamberlain',
    targetCount: 2,
    schedule: [{ from: 0, rate: 60 }],
    witnessOffice: 'clerk',
    witnessMonth: 1,
    rumorMonth: 1,
    witnessBelief: 'The receiver works late.',
    rumorText: 'The receiver bought a fine horse.',
    directives: (t) => [`SECRET: skimming ${t.join(', ')}`],
  },
  prompts: {
    actorSystem: 'actor', adjudicatorSystem: 'adjudicator', scribeSystem: 'scribe', dmSystem: 'dm',
  },
};
