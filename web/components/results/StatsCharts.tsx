'use client';

import type { StatsChartsProps } from '../contracts';
import { fmtInt, fmtMoney } from '../../lib/format';

/**
 * STUB — replaced by Wave-2 unit "Stats + charts". Real version renders the 4 metrics
 * with Recharts visualizations (audience-vs-base + reachability/segment mini-charts).
 * The stub shows the raw numbers so the data wiring is visible.
 */
export function StatsCharts({ data }: StatsChartsProps) {
  const stat = (num: string, label: string, dot: string) => (
    <div className="stat">
      <div className="stat-num">{num}</div>
      <div className="stat-lbl">
        <span className={`dot ${dot}`} />
        {label}
      </div>
    </div>
  );
  return (
    <div className="stats">
      {stat(data ? fmtInt(data.audienceCount) : '—', 'In audience', 'dot-navy')}
      {stat(data ? `${(data.pctBase || 0).toFixed(1)}%` : '—', 'of customer base', 'dot-lime')}
      {stat(data ? fmtInt(data.reachCount) : '—', 'Reachable · email/SMS', 'dot-cyan')}
      {stat(data ? fmtMoney(data.avgValue) : '—', 'Avg lifetime value', 'dot-green')}
    </div>
  );
}
