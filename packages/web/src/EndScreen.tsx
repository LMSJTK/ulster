import type { RevealView } from '@redearl/engine';
import { fmtMoney } from './api.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function EndScreen({ reveal, onNewGame }: { reveal: RevealView; onNewGame: () => void }) {
  return (
    <div className="overlay endscreen">
      <div className="parchment end-card">
        <h2>{reveal.ending === 'justice' ? 'Justice, of a kind' : 'The Letter from Dublin'}</h2>
        <p className="epilogue">{reveal.epilogue}</p>
        <div className="end-stats">
          <span>Stolen over the year: <b>{fmtMoney(reveal.stolenTotal)}</b></span>
          <span>Recovered: <b>{fmtMoney(reveal.recovered)}</b></span>
        </div>

        <h3>What was actually happening</h3>
        <p className="hint">The hidden record of the year — every theft, raid, and whisper as it truly occurred.</p>
        <div className="timeline">
          {reveal.timeline.map((t, i) => (
            <div key={i} className="timeline-row">
              <span className="timeline-month">{MONTHS[Math.min(11, t.month)].slice(0, 3)}</span>
              <span>{t.text.replace(/^[A-Z][a-z]+: /, '')}</span>
            </div>
          ))}
        </div>

        <button className="primary" onClick={onNewGame}>Begin another year</button>
      </div>
    </div>
  );
}
