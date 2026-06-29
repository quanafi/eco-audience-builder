/**
 * Display formatters shared by the UI (ported from static/app.js).
 */

// Customer profile in ServiceTitan. Mirrors ST_CUSTOMER_URL in lib/export.ts; this is
// the client-side display default (the server uses ST_CUSTOMER_URL env for exports).
export const ST_CUSTOMER_URL = 'https://go.servicetitan.com/#/customer/{id}';
export const stUrl = (id: number | string): string =>
  ST_CUSTOMER_URL.replace('{id}', encodeURIComponent(String(id)));

export const fmtInt = (n: number | null | undefined): string =>
  Number(n || 0).toLocaleString('en-US');

export const fmtMoney = (n: number | null | undefined): string =>
  '$' + Math.round(Number(n || 0)).toLocaleString('en-US');

/** Strip a leading "12. " ordinal prefix some segment labels carry. */
export const segLabel = (v: unknown): string => String(v).replace(/^\s*\d+\.\s*/, '');

/** Human "time ago" from a day count (10 -> "10d", 60 -> "2mo", 800 -> "2.2yr"). */
export const ago = (d: number | null | undefined): string =>
  d == null ? '—' : d < 31 ? `${d}d` : d < 365 ? `${Math.round(d / 30)}mo` : `${(d / 365).toFixed(1)}yr`;

/** "Mar 2026" from an ISO date string. */
export const fmtMonth = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
