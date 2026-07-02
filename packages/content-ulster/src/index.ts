import type { ContentPack } from '@redearl/engine';

/**
 * Content pack: the Earldom of Ulster, A.D. 1300.
 * Real start, free divergence. The engine knows offices, holdings, plots;
 * everything Irish lives here.
 */
export const ulster1300: ContentPack = {
  meta: {
    title: 'The Red Earl — Ulster, 1300',
    playerTitle: 'my lord earl',
    playerName: 'Richard de Burgh, Earl of Ulster',
    seat: 'Carrickfergus',
    year: 1300,
  },

  persons: [
    {
      id: 'mandeville',
      name: 'Sir Thomas de Mandeville',
      office: 'seneschal',
      title: 'Seneschal of Ulster',
      persona:
        'Old Anglo-Irish stock, a soldier-administrator whose family has served the earldom for two ' +
        'generations. Competent, proud, faintly weary of clerks. He answers plainly, defends his own ' +
        'stewardship of the courts, and considers the marches his particular business.',
      voice: 'Direct, soldierly, courteous but never fawning. Short sentences. Occasional dry humor.',
      competence: 0.8,
      startingBeliefs: [
        'Twescard and Coleraine lie nearest the marches and suffer first when the Irish stir.',
        'Domnall Ó Néill, king of Tír Eoghain, grows bold whenever the garrisons thin.',
        'The manor courts sit regularly, though Antrim is behind on its pleas.',
      ],
      smallTalk: [
        'The marches are quiet enough, my lord, though quiet is a thing the Irish lend, not give.',
        'The courts grind on. Pleas of debt, mostly, and a matter of strayed cattle at Antrim.',
      ],
    },
    {
      id: 'nicholas',
      name: 'Master Nicholas of Downpatrick',
      office: 'chamberlain',
      title: 'Chamberlain and Receiver',
      persona:
        'A clever cleric of merchant stock who rose by his letters and his tidy hand. All the manor ' +
        'receipts pass through him before they reach the treasury. Smooth, deferential, quietly vain ' +
        'about his indispensability.',
      voice: 'Polished, unctuous, precise with numbers when it suits him and vague when it does not.',
      competence: 0.9,
      startingBeliefs: [
        'Every manor receipt of the earldom passes through the receiver\'s hands each month.',
        'Revenues run lean through winter and swell after harvest; my lord should not be alarmed by the season.',
      ],
      smallTalk: [
        'The rolls are in order, my lord; the winter runs lean, as winters do.',
        'A receiver\'s work is dull as ditchwater and twice as necessary, my lord.',
      ],
    },
    {
      id: 'logan',
      name: 'Sir Walter de Logan',
      office: 'constable',
      title: 'Constable of Carrickfergus',
      persona:
        'A blunt soldier who counts spears, not pence. Loyal, unimaginative, happiest on the wall-walk. ' +
        'He notices horses, harness, and men — including who among the household suddenly rides a better ' +
        'palfrey than his wages should mount.',
      voice: 'Gruff, brief, concrete. Uncomfortable with figures beyond a muster-roll.',
      competence: 0.7,
      startingBeliefs: [
        'Carrickfergus holds two score spears; the march manors keep their own small garrisons.',
        'The men of Uí Néill probe the marches after every thaw.',
      ],
      smallTalk: [
        'Walls are sound, men are fed, my lord. That is the whole of my news.',
        'Give me ten more spears and I will give you a quieter march, my lord.',
      ],
    },
    {
      id: 'anselm',
      name: 'Brother Anselm',
      office: 'clerk',
      title: 'Clerk of the Wardrobe',
      persona:
        'A quiet Benedictine who keeps the wardrobe accounts and copies the rolls. Observant, ' +
        'scrupulous, easily overlooked — and he sees everything that crosses the writing-room. He is ' +
        'timid about accusing anyone above his station without being asked.',
      voice: 'Soft-spoken, precise, a little anxious. Defers, hedges, but answers direct questions honestly.',
      competence: 0.95,
      startingBeliefs: [
        'I keep the wardrobe accounts and make fair copies of the receiver\'s rolls.',
        'The exchequer at Dublin examines the earldom\'s accounts at each year\'s end, and misses little.',
      ],
      smallTalk: [
        'The ink freezes in the horn these mornings, my lord, but the copying goes on.',
        'Nothing to trouble my lord — though the year-end reckoning for Dublin is always in my thoughts.',
      ],
    },
  ],

  holdings: [
    { id: 'carrickfergus', name: 'Carrickfergus', region: 'the earl\'s seat on Belfast Lough', bailiff: 'Adam the Reeve', baseRevenue: 300, march: false, startingGarrison: 40 },
    { id: 'twescard', name: 'Twescard', region: 'the north county', bailiff: 'Gilbert of Bushmills', baseRevenue: 260, march: true, startingGarrison: 10 },
    { id: 'coleraine', name: 'Coleraine', region: 'the Bann fisheries', bailiff: 'John le Fisher', baseRevenue: 220, march: true, startingGarrison: 8 },
    { id: 'antrim', name: 'Antrim', region: 'the middle county', bailiff: 'William of the Ford', baseRevenue: 180, march: false, startingGarrison: 4 },
    { id: 'greencastle', name: 'Greencastle', region: 'the south, over Carlingford Lough', bailiff: 'Ralph Crickett', baseRevenue: 200, march: false, startingGarrison: 8 },
    { id: 'dundonald', name: 'Dundonald', region: 'the Ards approaches', bailiff: 'Stephen of the Moat', baseRevenue: 160, march: false, startingGarrison: 4 },
  ],

  startingTreasury: 2000, // £100
  monthlyExpenses: 900, // £45 — household, garrison wages, alms
  //            Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
  seasonalCurve: [0.8, 0.8, 0.9, 1.0, 1.0, 1.05, 1.0, 1.2, 1.45, 1.35, 1.05, 0.9],

  raid: {
    chancePerMonth: 0.3,
    damage: [8, 18],
    raiderName: 'the men of Uí Néill',
  },

  scriptedEvents: [
    {
      id: 'caerlaverock',
      kind: 'summons',
      month: 4, // May 1300 — Edward I musters for Caerlaverock
      text:
        'Edward, by the grace of God King of England, Lord of Ireland — to his beloved and faithful ' +
        'Richard de Burgh, Earl of Ulster: we require your service, with men and arms, for our war in ' +
        'Scotland this summer, to muster at Carlisle at midsummer.',
    },
    {
      id: 'murrain',
      kind: 'murrain',
      month: 'random',
      text: 'A murrain has come among the cattle; beasts sicken in the byres.',
    },
    {
      id: 'bann_storm',
      kind: 'storm',
      month: 'random',
      text: 'A great storm out of the north has broken weirs and drowned the low meadows.',
    },
  ],

  plot: {
    id: 'chamberlains-skim',
    schemerOffice: 'chamberlain',
    targetCount: 2,
    // Per-mille of true receipts, escalating: ~6%, then 10%, then 15%.
    schedule: [
      { from: 0, rate: 60 },
      { from: 3, rate: 100 },
      { from: 8, rate: 150 },
    ],
    witnessOffice: 'clerk',
    witnessMonth: 3,
    rumorMonth: 2,
    witnessBelief:
      'Master Nicholas has twice stayed among the rolls long after compline, and was short with me ' +
      'when I offered to carry the tallies for him.',
    rumorText:
      'Master Nicholas has bought a grey palfrey of southern stock, and silver plate for his table — ' +
      'a rich style for a receiver\'s stipend.',
    directives: (targets: string[]) => [
      `SECRET: You are skimming the receipts of ${targets.join(' and ')} — a modest portion each month, entered short in your rolls before they reach the earl.`,
      'Never volunteer figures for those manors. If pressed on them, be smooth: blame the season, the raids, the roads. Offer plausible detail, never numbers you can be caught on.',
      'If accused without proof, be wounded and indignant — you have served faithfully for nine years.',
      'If confronted with the manors\' own tallies contradicting your roll, falter, then confess and beg mercy.',
      'You believe the earl is too fond of his hawks to read the rolls closely. Flatter that fondness.',
    ],
  },

  prompts: {
    actorSystem:
      'You are playing a character in the Earldom of Ulster in the year 1300, at Carrickfergus Castle, ' +
      'the seat of Richard de Burgh, the Red Earl. Stay strictly in character and in period: no modern ' +
      'knowledge, no anachronism. Speak naturally, in one to five sentences, as in a real audience with ' +
      'your lord. You know ONLY what is in your briefing below; if asked about things you do not know, ' +
      'say so plainly rather than inventing figures.',
    adjudicatorSystem:
      'You are the recording clerk of a meeting between the Earl of Ulster and one of his officers. ' +
      'Extract only what the EARL actually ordered, promised, or formally accused — not musings. ' +
      'Map orders onto the provided action types; use freeform only when nothing fits, with modest effects. ' +
      'Note which of the candidate confidences the officer actually disclosed, and rate the earl\'s tone.',
    scribeSystem:
      'You are a scribe of 1300 rendering documents and briefings for the Earl of Ulster. Write brief, ' +
      'flavorful period prose. You MUST NOT alter, add, or omit any figure: the numbers you are given ' +
      'are the document. Two to five sentences, no headings, no lists.',
    dmSystem:
      'You are the hidden narrator of a game set in the Earldom of Ulster, 1300. You render dramatic ' +
      'scenes (court confrontations, judgments) from structured outcomes the engine has already decided. ' +
      'You never change outcomes, amounts, or facts; you give them voice. Four to eight sentences.',
  },
};

export default ulster1300;
