'use client';

import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { StatsChartsProps } from '../contracts';
import { fmtInt, fmtMoney } from '../../lib/format';

// Eco palette (mirrors static/styles.css --navy/--cyan/--green/--lime).
const NAVY = '#003057';
const CYAN = '#009FDF';
const GREEN = '#00843D';
const LIME = '#84BD00';
const LINE = '#E4E9EF';
const G500 = '#6B7480';

// Avg-lifetime-value gauge ceiling — mirrors the legacy `avgValue / 5000 * 100` stat
// bar in static/app.js renderResult().
const AVG_VALUE_CEILING = 5000;

const pct = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Stats + charts strip. Renders the 4 headline metrics (audience count, % of base,
 * reachable count, avg lifetime value) as on-palette cards, then replaces the legacy
 * CSS stat bars (static/app.js) with Recharts visualizations:
 *  - an audience-vs-base comparison bar (how the segment sizes up against the full base)
 *  - reachability and avg-value mini gauges derived from the result.
 *
 * `data` is null before the first /api/audience load — we render a calm placeholder.
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

  const metrics = (
    <div className="stats">
      {stat(data ? fmtInt(data.audienceCount) : '—', 'In audience', 'dot-navy')}
      {stat(data ? `${(data.pctBase || 0).toFixed(1)}%` : '—', 'of customer base', 'dot-lime')}
      {stat(data ? fmtInt(data.reachCount) : '—', 'Reachable · email/SMS', 'dot-cyan')}
      {stat(data ? fmtMoney(data.avgValue) : '—', 'Avg lifetime value', 'dot-green')}
    </div>
  );

  if (!data) {
    return (
      <div className="statcharts" data-testid="statcharts">
        {metrics}
        <div
          className="statcharts-empty"
          style={{
            border: `1px solid ${LINE}`,
            borderRadius: 16,
            background: '#fff',
            padding: '28px 20px',
            marginBottom: 22,
            textAlign: 'center',
            fontSize: 12,
            letterSpacing: '.04em',
            color: G500,
          }}
        >
          Charts appear once your first audience loads.
        </div>
      </div>
    );
  }

  // Audience-vs-base comparison: absolute counts, navy for the live segment, lime for
  // the full customer base it's carved from.
  const compareData = [
    { name: 'In audience', value: data.audienceCount, fill: NAVY },
    { name: 'Customer base', value: data.baseCount, fill: LIME },
  ];

  // Reachable share of the audience (email/SMS), and avg lifetime value against a
  // $5k ceiling — the same ratios the legacy stat bars encoded.
  const reachPct = data.audienceCount ? (data.reachCount / data.audienceCount) * 100 : 0;
  const avgPct = (data.avgValue / AVG_VALUE_CEILING) * 100;

  const gaugeData = [
    { name: 'Reachable', value: pct(reachPct), display: `${reachPct.toFixed(0)}%`, fill: CYAN },
    { name: 'Avg value', value: pct(avgPct), display: fmtMoney(data.avgValue), fill: GREEN },
  ];

  return (
    <div className="statcharts" data-testid="statcharts">
      {metrics}
      <div
        className="statcharts-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
          gap: 14,
          marginBottom: 22,
        }}
      >
        <ChartCard title="Audience vs. customer base">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={compareData} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
              <XAxis type="number" hide domain={[0, data.baseCount || 1]} />
              <YAxis
                type="category"
                dataKey="name"
                width={92}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: G500 }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,48,87,.05)' }}
                formatter={(v: number) => [fmtInt(v), 'Customers']}
              />
              <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={22} isAnimationActive={false}>
                {compareData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => fmtInt(v)}
                  style={{ fontSize: 11, fontWeight: 700, fill: NAVY }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Reachability & value">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={gaugeData} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: G500 }}
              />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                cursor={{ fill: 'rgba(0,48,87,.05)' }}
                formatter={(_v: number, _n, item) => [item?.payload?.display ?? '', item?.payload?.name ?? '']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={46} isAnimationActive={false}>
                {gaugeData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="display"
                  position="top"
                  style={{ fontSize: 11, fontWeight: 700, fill: NAVY }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: '14px 16px 8px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: G500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
