/**
 * Exportable customer column catalog + query builder (port of the COLUMN_CATALOG /
 * _build_query seam from app/export.py).
 *
 * Lives in the foundation so BOTH the export route and the ads route import it here —
 * not from each other. Reuses the WHERE-builder from audienceQuery so exports apply the
 * same include+exclude+suppression logic, selecting only the requested columns with no
 * row limit (the export is the *whole* matching audience — caller streams it).
 */
import {
  buildFilters,
  buildSelect,
  whereSql,
  CITY_EXPR,
  PRIMARY_TRADE_EXPR,
  STATE_EXPR,
  ZIP_EXPR,
  JOBS_TABLE,
  TABLE,
} from './audienceQuery';
import type { FilterPayload } from './types';

// Comma-joined list of a customer's distinct job tags. Correlated subquery, so it's
// opt-in (not in DEFAULT_COLUMNS) — one lookup per exported row.
export const JOB_TAGS_EXPR =
  `(select string_agg(distinct trim(tg), ', ') from ${JOBS_TABLE} j ` +
  `cross join unnest(string_to_array(j.tags, ',')) as tg ` +
  `where j.customer_id = ${TABLE}.customer_id and trim(tg) <> '')`;

export type ColumnKind = 'int' | 'str' | 'money' | 'date' | 'bool';
export interface CatalogEntry {
  header: string;
  expr: string;
  kind: ColumnKind;
}

// Allow-list of exportable columns. Order here is the order columns appear in the file.
export const COLUMN_CATALOG: Record<string, CatalogEntry> = {
  customer_id: { header: 'Customer ID', expr: 'customer_id', kind: 'int' },
  name: { header: 'Name', expr: 'name', kind: 'str' },
  email: { header: 'Email', expr: 'email', kind: 'str' },
  phone_number: { header: 'Phone', expr: 'phone_number', kind: 'str' },
  city: { header: 'City', expr: CITY_EXPR, kind: 'str' },
  state: { header: 'State', expr: STATE_EXPR, kind: 'str' },
  zip: { header: 'ZIP', expr: ZIP_EXPR, kind: 'str' },
  address: { header: 'Address', expr: 'address', kind: 'str' },
  primary_trade: { header: 'Primary trade', expr: PRIMARY_TRADE_EXPR, kind: 'str' },
  lifetime_jobs: { header: 'Lifetime jobs', expr: 'lifetime_jobs', kind: 'int' },
  lifetime_revenue: { header: 'Lifetime revenue', expr: 'lifetime_revenue', kind: 'money' },
  last_completed_job: { header: 'Last job date', expr: 'last_completed_job', kind: 'date' },
  days_since_last_job: { header: 'Days since last job', expr: 'days_since_last_job', kind: 'int' },
  lifetime_revenue_segment: { header: 'Revenue segment', expr: 'lifetime_revenue_segment', kind: 'str' },
  frequency_segment: { header: 'Frequency segment', expr: 'frequency_segment', kind: 'str' },
  paid_recency_segment: { header: 'Recency segment', expr: 'paid_recency_segment', kind: 'str' },
  job_tags: { header: 'Job tags', expr: JOB_TAGS_EXPR, kind: 'str' },
  is_member: { header: 'EcoFi member', expr: 'is_member', kind: 'bool' },
  is_repeat_customer: { header: 'Repeat customer', expr: 'is_repeat_customer', kind: 'bool' },
  has_email: { header: 'Has email', expr: "(email is not null and email <> '')", kind: 'bool' },
  has_mobile: { header: 'Has mobile', expr: "(phone_number is not null and phone_number <> '')", kind: 'bool' },
};

// Sensible default selection when the caller doesn't specify columns.
export const DEFAULT_COLUMNS = [
  'customer_id', 'name', 'email', 'phone_number', 'city', 'state', 'zip',
  'primary_trade', 'lifetime_jobs', 'lifetime_revenue', 'last_completed_job',
];

/** Keep only known columns, ordered by the catalog (customer_id first); fall back to
 * DEFAULT_COLUMNS when nothing valid was requested. */
export function resolveColumns(columns?: string[]): string[] {
  const requested = new Set(columns ?? []);
  const cols = Object.keys(COLUMN_CATALOG).filter((k) => requested.has(k));
  return cols.length ? cols : [...DEFAULT_COLUMNS];
}

/**
 * Build the (sql, params) for selecting `columns` over the filtered audience. `columns`
 * must be valid catalog keys (callers resolve first, except ads which passes a fixed
 * PII set). `available` gates do-not-contact suppression to columns the mart has.
 */
export function buildColumnQuery(
  columns: string[],
  filters: FilterPayload,
  available?: Iterable<string> | null,
): { sql: string; params: unknown[] } {
  const { where, params } = buildFilters(filters ?? {}, available);
  const selectList = columns.map((c) => `${COLUMN_CATALOG[c].expr} as ${c}`).join(',\n    ');
  const sql = buildSelect(selectList, whereSql(where), 'customer_id asc');
  return { sql, params };
}
