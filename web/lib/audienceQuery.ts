/**
 * Build read-only audience SQL against edw2.customers from a filter payload.
 *
 * Port of app/audience_query.py. The live customer mart (edw2.customers, one row per
 * customer_id) is the source of truth — see skills/eco-edw-querying.
 *
 * KEY DIFFERENCE from the Python original: `pg` uses POSITIONAL parameters ($1, $2, …)
 * with a values array, not SQLAlchemy's named `:p1` binds. BindRenderer emits `$N` and
 * pushes to an ordered params array; `= any($n)` accepts a JS array directly.
 *
 * Both renderers share `allClauses`, so the executed (parameterized) query and the
 * displayed (literal) SQL can never drift apart.
 */
import type { Config, FilterPayload, FilterSet, PreviewRow, Row } from './types';

export const TABLE = 'edw2.customers';
// One row per (job, ...) with a comma-separated `tags` column; joined back to
// customers by customer_id to filter on job tags.
export const JOBS_TABLE = 'edw2.jobs';

// Allow-listed filter vocabularies — used both to validate input and to render the
// inline (display) SQL safely; anything outside these sets is rejected.
export const TRADES: Record<string, string> = {
  Plumbing: 'plumbing_customer',
  HVAC: 'hvac_customer',
  Electric: 'electric_customer',
};
export const REGIONS: Record<string, string> = {
  Columbus: 'is_columbus_customer',
  Dayton: 'is_dayton_customer',
  Cincinnati: 'is_cincinnati_customer',
  Chillicothe: 'is_chillicothe_customer',
};
// FLAGS values are appended to the WHERE list verbatim (they bypass the value
// renderer), so they MUST be parameter-free constant SQL.
export const FLAGS: Record<string, string> = {
  has_email: "(email is not null and email <> '')",
  has_mobile: "(phone_number is not null and phone_number <> '')",
  is_member: 'is_member = 1',
  is_repeat_customer: 'is_repeat_customer = 1',
};
// Human-readable labels for the flags (served via /api/config). Order = display order.
export const FLAG_LABELS: Record<string, string> = {
  is_member: 'EcoFi member',
  has_email: 'Has email',
  has_mobile: 'Has mobile',
  is_repeat_customer: 'Repeat customer',
};
// "Do not contact" suppressions: an always-on baseline exclusion, gated to columns
// that actually exist in the live mart (snapshot.availableSuppress). A customer is
// dropped if any predicate is TRUE.
export const SUPPRESS: Record<string, string> = {
  do_not_mail: 'do_not_mail is true',
  do_not_text: "(do_not_text_numbers is not null and do_not_text_numbers <> '')",
  do_not_service: 'do_not_service is true',
};
export const SEGMENT_COLUMNS: Record<string, string> = {
  revenueSegments: 'lifetime_revenue_segment',
  frequencySegments: 'frequency_segment',
  recencySegments: 'paid_recency_segment',
};
export const SEGMENT_GROUP_LABELS: Record<string, string> = {
  revenueSegments: 'Lifetime revenue tier',
  frequencySegments: 'Visit frequency',
  recencySegments: 'Paid recency',
};

// SQL fragments parsed out of the free-text address. The backslashes here are part of
// the Postgres regex text — kept identical to the Python originals.
export const ZIP_EXPR = "substring(address from '(\\d{5})(?:-\\d{4})?\\s*$')";
export const CITY_EXPR =
  "substring(address from ',\\s*([^,]+),\\s*[A-Za-z]{2}\\s+\\d{5}')";
export const STATE_EXPR = "substring(address from ',\\s*([A-Za-z]{2})\\s+\\d{5}')";
export const PRIMARY_TRADE_EXPR = `case
        when greatest(coalesce(plumbing_jobs,0), coalesce(hvac_jobs,0), coalesce(electric_jobs,0)) = 0 then null
        when coalesce(plumbing_jobs,0) >= coalesce(hvac_jobs,0) and coalesce(plumbing_jobs,0) >= coalesce(electric_jobs,0) then 'Plumbing'
        when coalesce(hvac_jobs,0) >= coalesce(electric_jobs,0) then 'HVAC'
        else 'Electric'
    end`;

export const ROW_LIMIT = 200;

/**
 * Column list for the preview-row fetch (port of the select list in
 * audience_query._fetch_preview_rows). Paired with `presentRow` — it selects exactly
 * the columns PreviewRow needs, including `state` and the has_email/has_mobile
 * expressions that buildDisplaySql intentionally omits. The audience route should do
 * `buildSelect(PREVIEW_SELECT_LIST, '\nwhere customer_id = any($1)')` then map presentRow,
 * NOT reuse buildDisplaySql's column list.
 */
export const PREVIEW_SELECT_LIST = `customer_id,
    name,
    ${CITY_EXPR}            as city,
    ${ZIP_EXPR}             as zip,
    ${STATE_EXPR}           as state,
    ${PRIMARY_TRADE_EXPR}   as primary_trade,
    lifetime_jobs,
    lifetime_revenue,
    last_completed_job,
    days_since_last_job,
    lifetime_revenue_segment,
    is_member,
    (email is not null and email <> '')        as has_email,
    (phone_number is not null and phone_number <> '') as has_mobile,
    is_repeat_customer`;

/** Canonical filter vocabulary served to the frontend (GET /api/config). */
export function filterConfig(): Config {
  return {
    flags: Object.keys(FLAG_LABELS).map((k) => ({ f: k, label: FLAG_LABELS[k] })),
    trades: Object.keys(TRADES),
    regions: Object.keys(REGIONS),
    segmentGroups: Object.keys(SEGMENT_COLUMNS).map((k) => ({
      key: k,
      label: SEGMENT_GROUP_LABELS[k],
    })),
  };
}

// ----------------------------------------------------------------- coercion helpers
export function asList<T = unknown>(v: unknown): T[] {
  if (v === null || v === undefined) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  // Only scalars become numbers. Python's _num wraps float(v) in try/except, so a
  // non-scalar (e.g. an array from a malformed payload) yields None; JS Number([]) is
  // 0, so we must reject non-(number|string) explicitly rather than coerce.
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Accept a raw string or list; keep only valid 5-digit ZIPs. */
export function cleanZips(raw: unknown): string[] {
  const tokens = Array.isArray(raw)
    ? raw.map((t) => String(t))
    : String(raw ?? '').split(/[\s,]+/);
  return tokens.map((s) => s.trim()).filter((t) => /^\d{5}$/.test(t));
}

// The known job-tag vocabulary, used to reject anything not actually in the data.
// Provided by the snapshot store at runtime (inverted from snapshot.py `_valid_tags`,
// which queried the DB).
//
// IMPORTANT: the default provider returns an EMPTY set, so cleanTags drops ALL tags
// until something registers a real provider. In production, importing snapshotStore
// (which every filtering route does, to read availableSuppress / the snapshot) runs the
// registration as a side-effect. In unit tests there is no snapshot, so any test that
// exercises a tag filter MUST call setTagVocabProvider(() => new Set([...])) first —
// otherwise tag clauses silently vanish (see audienceQuery.test.ts / parity.test.ts).
let tagVocabProvider: () => ReadonlySet<string> = () => new Set<string>();
export function setTagVocabProvider(fn: () => ReadonlySet<string>): void {
  tagVocabProvider = fn;
}
function validTags(): ReadonlySet<string> {
  return tagVocabProvider();
}
export function cleanTags(raw: unknown): string[] {
  const vocab = validTags();
  return asList<string>(raw).filter((t) => vocab.has(t));
}

/** Render a validated value as an inline SQL literal for the display query. */
function sqlLit(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    // Plain decimal via String(): clean, unambiguous SQL across the whole spend range
    // (JS only switches to exponent notation at ≥1e21, far beyond any spend value).
    // This intentionally differs from Python's f"{v:g}" for values ≥1e6 (which would
    // print "1e+06") — the literals are numerically identical, and the executed
    // (parameterized) query is unaffected; this only changes the copy-paste display SQL.
    return String(v);
  }
  return "'" + String(v).replaceAll("'", "''") + "'";
}

interface Renderer {
  compare(expr: string, op: string, value: unknown): string;
  membership(expr: string, values: unknown[]): string;
}

/**
 * Emit filter values as positional bind parameters — the form executed by runQuery.
 * One instance is shared across include and exclude sets, so its append-only params
 * array guarantees placeholder numbers never collide between them.
 */
export class BindRenderer implements Renderer {
  readonly params: unknown[] = [];
  private bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
  compare(expr: string, op: string, value: unknown): string {
    return `${expr} ${op} ${this.bind(value)}`;
  }
  membership(expr: string, values: unknown[]): string {
    return `${expr} = any(${this.bind(values)})`;
  }
}

/** Emit filter values as inlined, validated SQL literals — the copy-paste display query. */
export class LiteralRenderer implements Renderer {
  compare(expr: string, op: string, value: unknown): string {
    return `${expr} ${op} ${sqlLit(value)}`;
  }
  membership(expr: string, values: unknown[]): string {
    return `${expr} in (${values.map(sqlLit).join(', ')})`;
  }
}

/** Return WHERE clauses for a single filter set, using `render` to emit values. */
export function filterClauses(fset: FilterSet, render: Renderer): string[] {
  const where: string[] = [];
  const seg = fset as Record<string, unknown>;

  const trades = asList<string>(fset.trades).filter((t) => t in TRADES);
  if (trades.length) {
    where.push('(' + trades.map((t) => `${TRADES[t]} = 1`).join(' or ') + ')');
  }

  const regions = asList<string>(fset.regions).filter((r) => r in REGIONS);
  if (regions.length) {
    where.push('(' + regions.map((r) => `${REGIONS[r]} = 1`).join(' or ') + ')');
  }

  const rmin = num(fset.recencyMin);
  const rmax = num(fset.recencyMax);
  if (rmin !== null) where.push(render.compare('days_since_last_job', '>=', Math.trunc(rmin)));
  if (rmax !== null) where.push(render.compare('days_since_last_job', '<=', Math.trunc(rmax)));

  const zips = cleanZips(fset.zips);
  if (zips.length) where.push(render.membership(ZIP_EXPR, zips));

  const smin = num(fset.spendMin);
  const smax = num(fset.spendMax);
  if (smin !== null) where.push(render.compare('lifetime_revenue', '>=', smin));
  if (smax !== null) where.push(render.compare('lifetime_revenue', '<=', smax));

  for (const [key, col] of Object.entries(SEGMENT_COLUMNS)) {
    const vals = asList(seg[key]);
    if (vals.length) where.push(render.membership(col, vals.map((v) => String(v))));
  }

  for (const flag of asList<string>(fset.flags)) {
    if (flag in FLAGS) where.push(FLAGS[flag]);
  }

  // Job tags: keep customers who have *any* selected tag on *any* of their jobs.
  // Correlated EXISTS against edw2.jobs so Postgres can use the customer_id index.
  const tags = cleanTags(fset.tags);
  if (tags.length) {
    const membership = render.membership('trim(tg)', tags);
    where.push(
      `exists (select 1 from ${JOBS_TABLE} j ` +
        `cross join unnest(string_to_array(j.tags, ',')) as tg ` +
        `where j.customer_id = ${TABLE}.customer_id and ${membership})`,
    );
  }

  return where;
}

/** The always-on "do not contact" keys to exclude, in SUPPRESS order, limited to
 * columns that exist in the live mart. `available` null/undefined emits nothing. */
function suppressKeys(available?: Iterable<string> | null): string[] {
  const avail = available == null ? new Set<string>() : new Set(available);
  return Object.keys(SUPPRESS).filter((k) => avail.has(k));
}

/** Include clauses AND-ed with each exclude clause negated, then the always-on
 * "do not contact" suppressions (also negated). Both sets share one `render`. */
export function allClauses(
  payload: FilterPayload,
  render: Renderer,
  available?: Iterable<string> | null,
): string[] {
  const where = filterClauses(payload, render);
  for (const clause of filterClauses(payload.exclude ?? {}, render)) {
    where.push(`not (${clause})`);
  }
  for (const k of suppressKeys(available)) {
    where.push(`not (${SUPPRESS[k]})`);
  }
  return where;
}

/** Return { where, params } for the include + exclude sets plus any suppressions. */
export function buildFilters(
  payload: FilterPayload,
  available?: Iterable<string> | null,
): { where: string[]; params: unknown[] } {
  const render = new BindRenderer();
  const where = allClauses(payload, render, available);
  return { where, params: render.params };
}

export function whereSql(where: string[]): string {
  return where.length ? '\nwhere ' + where.join('\n  and ') : '';
}

/** Assemble a SELECT against the customer mart. Shared by preview + export queries so
 * the skeleton stays identical; only the column list and clauses differ per caller. */
export function buildSelect(selectList: string, whereSqlStr = '', orderBy?: string): string {
  const order = orderBy ? `\norder by ${orderBy}` : '';
  return `select\n    ${selectList}\nfrom ${TABLE}${whereSqlStr}${order}`;
}

/** Coerce a raw DB row into the preview-table shape (port of _present_row). */
export function presentRow(r: Row): PreviewRow {
  const cid = Number(r.customer_id);
  const str = (v: unknown) => (v == null ? '' : String(v)).trim();
  const lastJob = r.last_completed_job;
  let lastIso: string | null = null;
  if (lastJob instanceof Date) {
    // Format from local components (pg builds a `date` Date at local midnight) so the
    // ISO date can't drift a day under toISOString's UTC conversion.
    const y = lastJob.getFullYear();
    const m = String(lastJob.getMonth() + 1).padStart(2, '0');
    const d = String(lastJob.getDate()).padStart(2, '0');
    lastIso = `${y}-${m}-${d}`;
  } else if (lastJob != null) {
    lastIso = String(lastJob).slice(0, 10) || null;
  }
  return {
    customer_id: cid,
    name: str(r.name) || `Customer #${cid}`,
    city: str(r.city),
    zip: (r.zip as string) || '',
    state: str(r.state),
    primary_trade: (r.primary_trade as string) || '—',
    lifetime_jobs: Math.trunc(Number(r.lifetime_jobs) || 0),
    lifetime_revenue: Number(r.lifetime_revenue) || 0,
    last_completed_job: lastIso,
    days_since_last_job: r.days_since_last_job == null ? null : Number(r.days_since_last_job),
    segment: (r.lifetime_revenue_segment as string) || '',
    is_member: Boolean(r.is_member),
    has_email: Boolean(r.has_email),
    has_mobile: Boolean(r.has_mobile),
    is_repeat_customer: Boolean(r.is_repeat_customer),
  };
}

/** Render a copy-pasteable SELECT with literal (validated) values inlined. Display
 * only — the executed form is the parameterized buildFilters. Both share allClauses. */
export function buildDisplaySql(
  payload: FilterPayload,
  available?: Iterable<string> | null,
): string {
  const where = allClauses(payload, new LiteralRenderer(), available);
  const ws = whereSql(where);
  return `-- Audience Builder · read-only segment query
-- source mart: ${TABLE}  (one row per customer_id, ServiceTitan-derived)
select
    customer_id,
    name,
    ${CITY_EXPR} as city,
    ${ZIP_EXPR} as zip,
    ${PRIMARY_TRADE_EXPR.trim()} as primary_trade,
    lifetime_jobs,
    lifetime_revenue,
    last_completed_job,
    days_since_last_job,
    lifetime_revenue_segment,
    is_member,
    is_repeat_customer
from ${TABLE}${ws}
order by customer_id asc;`;
}
