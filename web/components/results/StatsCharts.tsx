'use client';

import type { StatsChartsProps } from '../contracts';
import { fmtInt, fmtMoney } from '../../lib/format';

/**
 * Stats strip. Renders the 4 headline metrics (audience count, % of base,
 * reachable count, avg lifetime value) as on-palette cards.
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

  return (
    <div className="statcharts" data-testid="statcharts">
      <div className="stats">
        {stat(data ? fmtInt(data.audienceCount) : '—', 'In audience', 'dot-navy')}
        {stat(data ? `${(data.pctBase || 0).toFixed(1)}%` : '—', 'of customer base', 'dot-lime')}
        {stat(data ? fmtInt(data.reachCount) : '—', 'Reachable · email/SMS', 'dot-cyan')}
        {stat(data ? fmtMoney(data.avgValue) : '—', 'Avg lifetime value', 'dot-green')}
      </div>
    </div>
  );
}
