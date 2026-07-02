import { derive } from './rng.js';
import { defOf, holdingDef, journal, monthLabel, personByOffice } from './state.js';
import type { ContentPack, DocLine, GameDocument, GameState } from './types.js';
import { fmtMoney, MONTHS } from './types.js';

/**
 * The epistemics pipeline. Documents are generated from ground truth through
 * per-source distortion filters into fixed lines/claims; the Scribe (LLM or
 * plain fallback) only ever writes prose *around* these fixed facts.
 */

/** Receiver's monthly roll: the chamberlain's report of receipts — falsified on plot targets. */
export function makeReceiversRoll(state: GameState, content: ContentPack, month: number): GameDocument {
  const chamberlain = personByOffice(state, content, content.plot.schemerOffice);
  const lines: DocLine[] = [];
  let total = 0;
  for (const h of content.holdings) {
    const reported = state.holdings[h.id].reportedReceipts[month];
    if (reported === null) continue;
    total += reported;
    lines.push({
      id: `h_${h.id}`,
      label: `Receipts of ${h.name}`,
      value: reported,
    });
  }
  lines.push({ id: 'expenses', label: 'Household and garrison expenses', value: -content.monthlyExpenses });
  lines.push({ id: 'total', label: 'Rendered to the treasury', value: total - content.monthlyExpenses });

  return {
    id: `roll_m${month}`,
    kind: 'receivers_roll',
    title: `Receiver's roll, ${monthLabel(content, month)}`,
    sourceId: chamberlain.id,
    month,
    deliveredMonth: state.month,
    lines,
    claims: [
      `The receiver attests these sums complete and true for ${MONTHS[month]}.`,
    ],
    prose: '',
  };
}

/** Bailiff receipts: the manor's own record — true figures. Covers up to the last 3 closed months. */
export function makeBailiffReceipts(
  state: GameState, content: ContentPack, holdingId: string, upToMonth: number,
): GameDocument {
  const h = holdingDef(content, holdingId);
  const lines: DocLine[] = [];
  for (let m = Math.max(0, upToMonth - 2); m <= upToMonth; m++) {
    const v = state.holdings[holdingId].trueReceipts[m];
    if (v === null) continue;
    lines.push({
      id: `m${m}_${holdingId}`,
      label: `${MONTHS[m]}: rendered by the manor of ${h.name}`,
      value: v,
    });
  }
  return {
    id: `receipts_${holdingId}_m${upToMonth}`,
    kind: 'bailiff_receipts',
    title: `Receipts of the bailiff of ${h.name}`,
    sourceId: '',
    month: upToMonth,
    deliveredMonth: state.month,
    lines,
    claims: [`Sworn by ${h.bailiff}, bailiff of ${h.name}.`],
    prose: '',
  };
}

/** Clerk's audit: true figures for every holding, last 3 closed months. */
export function makeAuditReport(state: GameState, content: ContentPack, upToMonth: number): GameDocument {
  const clerk = personByOffice(state, content, content.plot.witnessOffice);
  const lines: DocLine[] = [];
  for (const h of content.holdings) {
    for (let m = Math.max(0, upToMonth - 2); m <= upToMonth; m++) {
      const v = state.holdings[h.id].trueReceipts[m];
      if (v === null) continue;
      lines.push({
        id: `m${m}_${h.id}`,
        label: `${MONTHS[m]}: ${h.name}, per the manor tallies`,
        value: v,
      });
    }
  }
  return {
    id: `audit_m${upToMonth}`,
    kind: 'audit_report',
    title: `Inquiry into the manor receipts, ${monthLabel(content, upToMonth)}`,
    sourceId: clerk.id,
    month: upToMonth,
    deliveredMonth: state.month,
    lines,
    claims: ['Compiled from the tally-sticks and court rolls of each manor, examined in person.'],
    prose: '',
  };
}

/** Seneschal's monthly report: conditions and tenant matters, with competence noise on estimates. */
export function makeSeneschalReport(
  state: GameState, content: ContentPack, month: number, eventNotes: string[],
): GameDocument {
  const sen = content.persons.find((p) => p.office === 'seneschal') ?? content.persons[0];
  const rng = derive(state.seed, 'senreport', month);
  const lines: DocLine[] = [];
  for (const h of content.holdings) {
    const true_ = state.holdings[h.id].condition;
    // Competence noise: the seneschal estimates; he does not measure.
    const noise = Math.round((rng() - 0.5) * 2 * (1 - sen.competence) * 20);
    const est = Math.max(0, Math.min(100, true_ + noise));
    lines.push({
      id: `cond_${h.id}`,
      label: `Estate of ${h.name}`,
      note: conditionWord(est),
    });
  }
  return {
    id: `senrep_m${month}`,
    kind: 'seneschal_report',
    title: `The seneschal's report, ${monthLabel(content, month)}`,
    sourceId: sen.id,
    month,
    deliveredMonth: state.month,
    lines,
    claims: eventNotes.length ? eventNotes : ['The tenants are quiet and the courts sit as usual.'],
    prose: '',
  };
}

/** Constable's garrison report. */
export function makeGarrisonReport(
  state: GameState, content: ContentPack, month: number, raidNotes: string[],
): GameDocument {
  const con = content.persons.find((p) => p.office === 'constable') ?? content.persons[0];
  const lines: DocLine[] = content.holdings
    .filter((h) => state.holdings[h.id].garrison > 0)
    .map((h) => ({
      id: `gar_${h.id}`,
      label: `Spears at ${h.name}`,
      value: undefined,
      note: `${state.holdings[h.id].garrison} men`,
    }));
  return {
    id: `garrep_m${month}`,
    kind: 'garrison_report',
    title: `The constable's muster, ${monthLabel(content, month)}`,
    sourceId: con.id,
    month,
    deliveredMonth: state.month,
    lines,
    claims: raidNotes.length ? raidNotes : ['The marches are watchful but quiet.'],
    prose: '',
  };
}

export function makeLetter(
  state: GameState, content: ContentPack, id: string, title: string, body: string,
): GameDocument {
  return {
    id,
    kind: 'letter',
    title,
    sourceId: '',
    month: state.month,
    deliveredMonth: state.month,
    lines: [],
    claims: [body],
    prose: '',
  };
}

export function makeNote(state: GameState, id: string, title: string, body: string): GameDocument {
  return {
    id,
    kind: 'note',
    title,
    sourceId: '',
    month: state.month,
    deliveredMonth: state.month,
    lines: [],
    claims: [body],
    prose: '',
  };
}

/**
 * After delivering a true-figures document (bailiff receipts or audit), plant
 * discrepancy evidence wherever its lines contradict a receiver's roll the
 * player holds. The lie was procedural, so the contradiction is exact.
 */
export function computeDiscrepancies(state: GameState, content: ContentPack, trueDoc: GameDocument): void {
  for (const line of trueDoc.lines) {
    const m = /^m(\d+)_(.+)$/.exec(line.id);
    if (!m || line.value === undefined) continue;
    const month = Number(m[1]);
    const holdingId = m[2];
    const reported = state.holdings[holdingId]?.reportedReceipts[month];
    if (reported === null || reported === undefined || reported === line.value) continue;

    const roll = state.documents.find((d) => d.kind === 'receivers_roll' && d.month === month);
    if (!roll) continue;
    const evId = `ev_disc_${holdingId}_m${month}`;
    if (state.evidence.some((e) => e.id === evId)) continue;

    const hname = holdingDef(content, holdingId).name;
    state.evidence.push({
      id: evId,
      kind: 'discrepancy',
      description:
        `${MONTHS[month]}: the receiver's roll gives ${fmtMoney(reported)} for ${hname}, ` +
        `but the manor's own tally gives ${fmtMoney(line.value)}.`,
      strength: 2,
      surfaced: false,
      month: state.month,
      docRefs: {
        a: { docId: roll.id, lineId: `h_${holdingId}` },
        b: { docId: trueDoc.id, lineId: line.id },
      },
    });
    journal(state, 'evidence',
      `A contradiction now exists in the archive: ${hname}, ${MONTHS[month]} ` +
      `(roll ${fmtMoney(reported)} vs tally ${fmtMoney(line.value)}).`, true);
  }
}

/**
 * Pin a document line. If the player's pins now cover both sides of a
 * discrepancy, it surfaces — diligence pays off.
 */
export function togglePin(
  state: GameState, content: ContentPack, docId: string, lineId: string,
): { pinned: boolean; surfaced: string[] } {
  const idx = state.pins.findIndex((p) => p.docId === docId && p.lineId === lineId);
  if (idx >= 0) {
    state.pins.splice(idx, 1);
    return { pinned: false, surfaced: [] };
  }
  state.pins.push({ docId, lineId });

  const surfaced: string[] = [];
  for (const ev of state.evidence) {
    if (ev.surfaced || ev.kind !== 'discrepancy' || !ev.docRefs) continue;
    const hasA = state.pins.some((p) => p.docId === ev.docRefs!.a.docId && p.lineId === ev.docRefs!.a.lineId);
    const hasB = state.pins.some((p) => p.docId === ev.docRefs!.b.docId && p.lineId === ev.docRefs!.b.lineId);
    if (hasA && hasB) {
      ev.surfaced = true;
      surfaced.push(ev.id);
      journal(state, 'evidence', `The lord's own eye found it: ${ev.description}`);
    }
  }
  return { pinned: true, surfaced };
}

/** Plain deterministic rendering — the fallback when no Scribe LLM is in play. */
export function renderDocumentPlain(doc: GameDocument, content: ContentPack): string {
  const parts: string[] = [];
  if (doc.sourceId) {
    const src = defOf(content, doc.sourceId);
    parts.push(`From ${src.name}, ${src.title}.`);
  }
  parts.push(...doc.claims);
  return parts.join(' ');
}

function conditionWord(c: number): string {
  if (c >= 90) return 'in good heart';
  if (c >= 75) return 'well enough';
  if (c >= 55) return 'strained';
  if (c >= 35) return 'in poor state';
  return 'wasted';
}
