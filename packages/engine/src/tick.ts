import {
  computeDiscrepancies, makeAuditReport, makeBailiffReceipts, makeGarrisonReport,
  makeLetter, makeReceiversRoll, makeSeneschalReport,
} from './documents.js';
import { derive, rngChance, rngInt, rngPick } from './rng.js';
import { addBelief, clampStat, defOf, holdingDef, journal, seatId, skimRate } from './state.js';
import type { ContentPack, GameDocument, GameState } from './types.js';
import { fmtMoney, MONTHS } from './types.js';
import { applyQueuedAction } from './actions.js';

export interface TickResult {
  /** Documents delivered this tick, prose not yet rendered. */
  newDocs: GameDocument[];
  /** Data for the Scribe to render the morning briefing from. */
  briefing: {
    monthClosed: string;
    newMonth: string;
    treasuryLabel: string;
    notes: string[];
    docTitles: string[];
  };
}

/**
 * Close out the current month: execute queued orders, run the economy and the
 * plot, fire events, generate the month's paperwork through the distortion
 * pipeline, and advance the calendar. Deterministic for a given seed and
 * action history.
 */
export function advanceMonth(state: GameState, content: ContentPack): TickResult {
  if (state.over) throw new Error('the game is over');
  const m = state.month;
  const notes: string[] = [];
  const senNotes: string[] = [];
  const raidNotes: string[] = [];
  const newDocs: GameDocument[] = [];

  // 1. Execute queued orders (accusations resolve immediately at confirmation,
  //    so anything here is a normal order).
  const receiptRequests = new Set<string>();
  let auditOrdered = false;
  for (const action of state.pendingActions) {
    if (action.type === 'request_document') receiptRequests.add(action.holdingId);
    else if (action.type === 'order_audit') auditOrdered = true;
    else applyQueuedAction(state, content, action, notes);
  }
  state.pendingActions = [];

  // 2. Auto-resolve overdue decisions (an unanswered summons answers itself, badly).
  for (const d of state.pendingDecisions) {
    if (!d.resolved && m >= d.deadline) {
      d.resolved = 'pay_fine';
      state.treasury -= 300;
      state.reputation = clampStat(state.reputation - 6);
      notes.push('The king\'s letter went unanswered too long; a fine was paid in lieu of service, and it was noticed.');
      journal(state, 'decision', 'The summons lapsed unanswered; the fine was paid late and grudgingly.');
    }
  }
  state.pendingDecisions = state.pendingDecisions.filter((d) => !d.resolved);

  // 3. Revenues, and the skim between the manors and the coffers.
  const revRng = derive(state.seed, 'rev', m);
  const rate = skimRate(state.plot, m);
  let deposited = 0;
  for (const h of content.holdings) {
    const hs = state.holdings[h.id];
    const jitter = 0.95 + revRng() * 0.1;
    const trueRev = Math.round(h.baseRevenue * content.seasonalCurve[m] * (hs.condition / 100) * jitter);
    hs.trueReceipts[m] = trueRev;
    let reported = trueRev;
    if (state.plot.targetHoldings.includes(h.id) && rate > 0) {
      const skim = Math.floor((trueRev * rate) / 1000);
      reported = trueRev - skim;
      state.plot.stolenTotal += skim;
      journal(state, 'skim',
        `${defOf(content, state.plot.schemerId).name} pockets ${fmtMoney(skim)} from the ` +
        `${h.name} receipts and enters ${fmtMoney(reported)} in the roll (true: ${fmtMoney(trueRev)}).`,
        true);
    }
    hs.reportedReceipts[m] = reported;
    deposited += reported;
    journal(state, 'revenue', `${h.name} rendered ${fmtMoney(trueRev)}.`, true);
  }
  state.treasury += deposited - content.monthlyExpenses;

  // 4. Raids on the marches.
  const raidRng = derive(state.seed, 'raid', m);
  const troopsAway = state.troopsAwayUntil !== undefined && m < state.troopsAwayUntil;
  const raidChance = content.raid.chancePerMonth * (troopsAway ? 1.6 : 1);
  const marches = content.holdings.filter((h) => h.march);
  if (marches.length > 0 && rngChance(raidRng, raidChance)) {
    const target = rngPick(raidRng, marches);
    const hs = state.holdings[target.id];
    const raw = rngInt(raidRng, content.raid.damage[0], content.raid.damage[1]);
    const dmg = Math.max(3, raw - Math.floor(hs.garrison / 4));
    hs.condition = clampStat(hs.condition - dmg);
    const note = `${content.raid.raiderName} rode against ${target.name}; cattle were driven off and byres burned.`;
    raidNotes.push(note);
    notes.push(note);
    journal(state, 'event', `Raid on ${target.name}: condition falls by ${dmg}.`, true);
    for (const office of ['constable', 'seneschal']) {
      const def = content.persons.find((p) => p.office === office);
      if (def) {
        addBelief(state, def.id, {
          id: `raid_m${m}_${def.id}`,
          text: `In ${MONTHS[m]}, ${content.raid.raiderName} raided ${target.name}.`,
          sensitivity: 'open',
        });
      }
    }
  } else {
    for (const h of marches) {
      state.holdings[h.id].condition = clampStat(state.holdings[h.id].condition + 3);
    }
  }
  // Quiet recovery elsewhere.
  for (const h of content.holdings) {
    if (!h.march) state.holdings[h.id].condition = clampStat(state.holdings[h.id].condition + 2);
  }

  // 5. Scripted events.
  for (const ev of content.scriptedEvents) {
    const evMonth = ev.month === 'random'
      ? 2 + Math.floor(derive(state.seed, 'sched', ev.id)() * 8)
      : ev.month;
    if (evMonth !== m) continue;

    if (ev.kind === 'summons') {
      const doc = makeLetter(state, content, `letter_${ev.id}`, 'A letter under the king\'s seal', ev.text);
      newDocs.push(doc);
      state.pendingDecisions.push({
        id: `dec_${ev.id}`,
        docId: doc.id,
        prompt: ev.text,
        options: [
          { id: 'send_troops', label: 'Send the seneschal with men for the war' },
          { id: 'pay_fine', label: 'Pay a fine in lieu of service' },
          { id: 'refuse', label: 'Refuse the summons' },
        ],
        deadline: Math.min(11, m + 2),
      });
      notes.push('A summons to the king\'s war in Scotland has arrived. It awaits your answer.');
      journal(state, 'event', 'A royal summons to the Scottish war arrived.');
      for (const p of content.persons) {
        addBelief(state, p.id, {
          id: `summons_${p.id}`,
          text: 'The king has summoned the earl\'s service for the war in Scotland.',
          sensitivity: 'open',
        });
      }
    } else if (ev.kind === 'murrain' || ev.kind === 'storm') {
      const evRng = derive(state.seed, 'evt', ev.id);
      const target = rngPick(evRng, content.holdings);
      state.holdings[target.id].condition = clampStat(state.holdings[target.id].condition - 12);
      const note = `${ev.text} (${target.name} suffers.)`;
      senNotes.push(note);
      notes.push(note);
      journal(state, 'event', `${ev.text} — ${target.name} loses condition.`, true);
    }
  }

  // 6. The witness notices something, if it is time.
  if (m === content.plot.witnessMonth) {
    const witness = content.persons.find((p) => p.office === content.plot.witnessOffice);
    if (witness) {
      addBelief(state, witness.id, {
        id: 'belief_testimony',
        text: content.plot.witnessBelief,
        sensitivity: 'guarded',
        evidenceId: 'ev_testimony',
      });
      journal(state, 'evidence', `${witness.name} has begun to notice something amiss.`, true);
    }
  }

  // 7. December: the Dublin exchequer's audit finds what you did not.
  if (m === 11) {
    if (state.plot.status !== 'exposed') {
      state.ending = 'audit';
      state.reputation = clampStat(state.reputation - 12);
      newDocs.push(makeLetter(state, content, 'letter_audit',
        'From the Exchequer at Dublin',
        'The treasurer\'s clerks, comparing the extents of the earldom against the sums rendered, ' +
        'find a shortfall they cannot account for — and wonder that the earl could not either.'));
      journal(state, 'ending',
        `The exchequer audit exposes a shortfall of ${fmtMoney(state.plot.stolenTotal - state.plot.recovered)}. ` +
        'The earl learns of the theft from Dublin, which is the worst way to learn of it.');
    } else {
      state.ending = 'justice';
      newDocs.push(makeLetter(state, content, 'letter_audit',
        'From the Exchequer at Dublin',
        'The treasurer\'s clerks find the earldom\'s accounts in good order, and note with approval ' +
        'the earl\'s own inquiry into the matter of the receipts.'));
      journal(state, 'ending', 'The exchequer finds the accounts in order; the earl\'s justice is noted in Dublin.');
    }
  }

  // 8. Resume a paused plot when its caution lapses.
  if (state.plot.status === 'paused' && state.plot.pausedUntil !== undefined && m + 1 >= state.plot.pausedUntil) {
    state.plot.status = 'active';
    journal(state, 'skim', 'The skimming quietly resumes, more carefully than before.', true);
  }

  // 9. Advance the calendar, then generate the month's paperwork (delivered in
  //    the new month).
  const closed = m;
  if (m >= 11) {
    state.over = true;
  } else {
    state.month = m + 1;
  }
  state.slots = 3;
  state.studiedThisMonth = false;

  newDocs.unshift(makeReceiversRoll(state, content, closed));
  newDocs.push(makeSeneschalReport(state, content, closed, senNotes));
  newDocs.push(makeGarrisonReport(state, content, closed, raidNotes));
  for (const holdingId of receiptRequests) {
    newDocs.push(makeBailiffReceipts(state, content, holdingId, closed));
  }
  if (auditOrdered) {
    newDocs.push(makeAuditReport(state, content, closed));
    journal(state, 'order', 'The clerk returned from his circuit of the manors with true tallies.');
  }

  state.documents.push(...newDocs);
  // Truth has arrived; see whether it contradicts the record.
  for (const doc of newDocs) {
    if (doc.kind === 'bailiff_receipts' || doc.kind === 'audit_report') {
      computeDiscrepancies(state, content, doc);
    }
  }

  return {
    newDocs,
    briefing: {
      monthClosed: `${MONTHS[closed]} ${state.year}`,
      newMonth: state.over ? 'the year\'s end' : `${MONTHS[state.month]} ${state.year}`,
      treasuryLabel: fmtMoney(state.treasury),
      notes,
      docTitles: newDocs.map((d) => d.title),
    },
  };
}
