import { useState } from 'react';
import type { PlayerView } from '@redearl/engine';
import { api, fmtMoney } from './api.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
  view: PlayerView;
  gameId: string;
  onView: (v: PlayerView) => void;
  onNotify: (msg: string) => void;
}

export function Archive({ view, gameId, onView, onNotify }: Props) {
  const docs = [...view.documents].reverse();
  const [openId, setOpenId] = useState<string | null>(docs[0]?.id ?? null);
  const open = docs.find((d) => d.id === openId) ?? docs[0];

  const isPinned = (docId: string, lineId: string) =>
    view.pins.some((p) => p.docId === docId && p.lineId === lineId);

  const togglePin = async (docId: string, lineId: string) => {
    try {
      const r = await api.pin(gameId, docId, lineId);
      onView(r.view);
      for (const desc of r.surfaced) {
        onNotify(`⚖ The figures do not agree — evidence surfaced: ${desc}`);
      }
    } catch (err) {
      onNotify((err as Error).message);
    }
  };

  if (docs.length === 0) {
    return <p className="hint">The archive is empty. Paperwork arrives as the months turn.</p>;
  }

  let lastMonth = -1;

  return (
    <div className="archive">
      <div className="doc-list">
        {docs.map((d) => {
          const header = d.deliveredMonth !== lastMonth
            ? <div key={`h${d.deliveredMonth}`} className="doc-month">{MONTHS[d.deliveredMonth]} {view.year}</div>
            : null;
          lastMonth = d.deliveredMonth;
          return (
            <div key={d.id}>
              {header}
              <button
                className={`doc-item ${open?.id === d.id ? 'active' : ''}`}
                onClick={() => setOpenId(d.id)}
              >
                {kindIcon(d.kind)} {d.title}
              </button>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="parchment doc-view">
          <h3>{open.title}</h3>
          <p className="doc-prose">{open.prose}</p>
          {open.lines.length > 0 && (
            <table className="doc-table">
              <tbody>
                {open.lines.map((l) => (
                  <tr
                    key={l.id}
                    className={isPinned(open.id, l.id) ? 'pinned' : ''}
                    onClick={() => togglePin(open.id, l.id)}
                    title={view.studiedThisMonth
                      ? 'Mark this figure for comparison'
                      : 'Spend a day studying the rolls to mark figures'}
                  >
                    <td className="pin-cell">{isPinned(open.id, l.id) ? '📌' : ''}</td>
                    <td>{l.label}</td>
                    <td className="num">{l.value !== undefined ? fmtMoney(l.value) : l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">
            {view.studiedThisMonth
              ? 'Click a figure to pin it. Pin two figures that should agree and do not, and you will have something.'
              : 'You have not studied the rolls this month; the figures blur together. (Spend a time slot to study.)'}
          </p>
        </div>
      )}
    </div>
  );
}

function kindIcon(kind: string): string {
  switch (kind) {
    case 'receivers_roll': return '𝄃';
    case 'bailiff_receipts': return '𝅭';
    case 'audit_report': return '⚖';
    case 'seneschal_report': return '🖋';
    case 'garrison_report': return '🛡';
    case 'letter': return '⚜';
    default: return '·';
  }
}
