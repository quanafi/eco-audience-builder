'use client';

import { Mail, Search, Smartphone } from 'lucide-react';
import type { PreviewTableProps } from '../contracts';
import type { PreviewRow } from '../../lib/types';
import { ago, fmtInt, fmtMoney, fmtMonth, stUrl } from '../../lib/format';

/**
 * Audience preview table — customer / location / trade / jobs / $ value / last job / flags.
 * Ported from the legacy static/app.js `rowHtml` + preview pane. Handles the loading,
 * error and empty states; the "top N of M" caption mirrors the legacy `renderResult`.
 */
export function PreviewTable({ rows, audienceCount, loading, error }: PreviewTableProps) {
  const hasRows = rows.length > 0;

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
              <th>Customer</th>
              <th>Location</th>
              <th>Primary trade</th>
              <th className="num">Jobs</th>
              <th className="num">Lifetime $</th>
              <th className="num">Last job</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
