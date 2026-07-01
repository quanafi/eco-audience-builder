'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Mail, Search, Smartphone } from 'lucide-react';
import type { PreviewTableProps } from '../contracts';
import type { PreviewRow } from '../../lib/types';
import { ago, fmtInt, fmtMoney, fmtMonth, stUrl } from '../../lib/format';

/**
 * Audience preview table — customer / location / trade / jobs / $ value / last job / flags.
 * Ported from the legacy static/app.js `rowHtml` + preview pane. Handles the loading,
 * error and empty states; the "top N of M" caption mirrors the legacy `renderResult`.
 */

type SortKey = 'customer' | 'location' | 'trade' | 'jobs' | 'revenue' | 'lastJob';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

// Direction is applied inside each comparator rather than multiplied on the outside,
// because `lastJob`'s nulls must sort last regardless of direction — an ordering that
// can't be expressed as a plain value under a uniform sign flip.
const COMPARATORS: Record<SortKey, (a: PreviewRow, b: PreviewRow, sign: 1 | -1) => number> = {
  customer: (a, b, sign) => sign * a.name.localeCompare(b.name),
  location: (a, b, sign) => sign * (a.city.localeCompare(b.city) || a.state.localeCompare(b.state)),
  trade: (a, b, sign) => sign * a.primary_trade.localeCompare(b.primary_trade),
  jobs: (a, b, sign) => sign * (a.lifetime_jobs - b.lifetime_jobs),
  revenue: (a, b, sign) => sign * (a.lifetime_revenue - b.lifetime_revenue),
  lastJob: (a, b, sign) => {
    const av = a.days_since_last_job;
    const bv = b.days_since_last_job;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return sign * (av - bv);
  },
};

export function PreviewTable({ rows, audienceCount, loading, error }: PreviewTableProps) {
  const [sort, setSort] = useState<SortState>(null);
  const hasRows = rows.length > 0;

  // Sorting is view state independent of the data: it persists across filter-driven
  // refetches and simply re-applies to whatever rows arrive next.
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const cmp = COMPARATORS[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => cmp(a, b, sign));
  }, [rows, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

  const ariaSortFor = (key: SortKey): 'ascending' | 'descending' | undefined => {
    if (sort?.key !== key) return undefined;
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  };

  const sortArrow = (key: SortKey) => {
    if (sort?.key !== key) return null;
    const Icon = sort.dir === 'asc' ? ChevronUp : ChevronDown;
    return <Icon className="sort-arrow" size={12} aria-hidden="true" />;
  };

  // Error and empty states share the centered `.empty` block (matching the legacy
  // showError / empty-pane behaviour), only the copy changes.
  if (error) {
    return (
      <div id="previewPane">
        <EmptyState title="Query error" sub={error} />
      </div>
    );
  }

  if (!loading && !hasRows) {
    return (
      <div id="previewPane">
        <EmptyState
          title="No customers match these filters."
          sub="Try widening the recency window or spend range."
        />
      </div>
    );
  }

  const caption = loading
    ? 'Loading…'
    : `${fmtInt(audienceCount)} ${audienceCount === 1 ? 'match' : 'matches'}`;

  return (
    <div id="previewPane">
      <div className="caption">
        <span>{caption}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th aria-sort={ariaSortFor('customer')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('customer')}>
                  Customer{sortArrow('customer')}
                </button>
              </th>
              <th aria-sort={ariaSortFor('location')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('location')}>
                  Location{sortArrow('location')}
                </button>
              </th>
              <th aria-sort={ariaSortFor('trade')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('trade')}>
                  Primary trade{sortArrow('trade')}
                </button>
              </th>
              <th className="num" aria-sort={ariaSortFor('jobs')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('jobs')}>
                  Jobs{sortArrow('jobs')}
                </button>
              </th>
              <th className="num" aria-sort={ariaSortFor('revenue')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('revenue')}>
                  Lifetime ${sortArrow('revenue')}
                </button>
              </th>
              <th className="num" aria-sort={ariaSortFor('lastJob')}>
                <button type="button" className="th-sort" onClick={() => toggleSort('lastJob')}>
                  Last job{sortArrow('lastJob')}
                </button>
              </th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <PreviewRowCells key={r.customer_id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewRowCells({ r }: { r: PreviewRow }) {
  const loc = [r.city, r.state].filter(Boolean).join(', ');
  return (
    <tr>
      <td>
        <div className="cust-name">{r.name}</div>
        <a
          className="cust-sub cust-link"
          href={stUrl(r.customer_id)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in ServiceTitan"
        >
          #{r.customer_id}
        </a>
      </td>
      <td>
        <div>{loc || '—'}</div>
        <div className="loc-sub">{r.zip || ''}</div>
      </td>
      <td>
        <span className="tag">{r.primary_trade}</span>
      </td>
      <td className="num">{fmtInt(r.lifetime_jobs)}</td>
      <td className="num">
        <strong>{fmtMoney(r.lifetime_revenue)}</strong>
      </td>
      <td className="num">
        <div>{ago(r.days_since_last_job)}</div>
        <div className="date-sub">{fmtMonth(r.last_completed_job)}</div>
      </td>
      <td>
        <div className="flags">
          {r.is_member ? <span className="tag tag-eco">EcoFi</span> : null}
          {r.has_email ? <Mail size={15} stroke="#9AA4B0" aria-label="Has email" /> : null}
          {r.has_mobile ? (
            <Smartphone size={15} stroke="#9AA4B0" aria-label="Has mobile" />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="empty">
      <Search size={34} stroke="#B3BBC4" strokeWidth={1.8} aria-hidden />
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}
