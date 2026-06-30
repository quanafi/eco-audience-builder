'use client';

import type { StatsChartsProps } from '../contracts';
import { fmtInt, fmtMoney } from '../../lib/format';

/**
 * Stats strip. The audience count is promoted to a dominant hero band — it is the
 * anchor of the whole UI (see DESIGN.md "The number is the anchor") — with the
 * other three metrics (% of base, reachable count, avg lifetime value) demoted to
 * a quieter supporting row beneath it.
 *
 * `data` is null before the first /api/audience load — metrics fall back to em-dashes.
 */
export function StatsCharts({ data }: StatsChartsProps) {
  const stat = (num: string, label: string, dot: string) => (
    <div className="stat" key={label}>
      <div className="stat-num">{num}</div>
      <div className="stat-lbl">
        <span className={`dot ${dot}`} />
        {label}
      </div>
    </div>
  );

  // Fill ratio for the hero's bottom bar — the live share of the base this audience covers.
  const pct = data ? Math.min(100, Math.max(0, data.pctBase || 0)) : 0;

  return (
    <div className="statcharts" data-testid="statcharts">
      <div className="stat-hero" aria-live="polite" aria-atomic="true">
        <div className="stat-hero-num">{data ? fmtInt(data.audienceCount) : '—'}</div>
        <div className="stat-hero-lbl">
          <span className="dot dot-navy" />
          Customers in audience
        </div>
        <div className="stat-bar stat-hero-bar" style={{ width: `${pct}%` }} />
      </div>

      <div className="stats">
        {stat(data ? `${(data.pctBase || 0).toFixed(1)}%` : '—', 'of customer base', 'dot-lime')}
        {stat(data ? fmtInt(data.reachCount) : '—', 'Reachable · email/SMS', 'dot-cyan')}
        {stat(data ? fmtMoney(data.avgValue) : '—', 'Avg lifetime value', 'dot-green')}
      </div>
    </div>
  );
}
