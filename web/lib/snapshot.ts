/**
 * In-memory columnar snapshot of the customer mart for fast, DB-free filtering.
 *
 * Port of app/snapshot.py. Every customer's *filterable* columns are loaded once
 * (daily) into typed arrays with a tag→customer inverted index, then filters, stats and
 * facet counts are evaluated entirely in-memory (no per-keystroke DB round-trips).
 *
 * The match/stat/facet logic mirrors the SQL semantics in audienceQuery.filterClauses
 * exactly — including the three-valued logic for the exclude set: each clause carries a
 * (truth, known) pair, and `not(clause)` keeps a row only where it is definitely FALSE
 * (known && !truth), reproducing SQL where a NULL predicate is not TRUE.
 *
 * Booleans are stored as Uint8Array (1/0) masks; nullable numerics use NaN; missing
 * strings (zip/segment) use the '' sentinel.
 */
import {
  FLAGS,
  JOBS_TABLE,
  REGIONS,
  SEGMENT_COLUMNS,
  TABLE,
  TRADES,
  asList,
  cleanZips,
  num,
} from './audienceQuery';
import { runQuery } from './db';
import type { AudienceStats, FacetCounts, Facets, FilterPayload, FilterSet, Row } from './types';

// Mart column each "do not contact" suppression key reads. do_not_text derives a
// boolean from the comma-joined do_not_text_numbers list (non-empty => opted out).
// These columns may not exist in the mart yet; fromWarehouse probes for them and falls
// back to a constant so a pre-migration warehouse still loads.
const SUPPRESS_SOURCE: Record<string, string> = {
  do_not_mail: 'do_not_mail',
  do_not_text: 'do_not_text_numbers',
  do_not_service: 'do_not_service',
};

const MISSING = '';
const ZIP_RE = /(\d{5})(?:-\d{4})?\s*$/;

// Daily refresh; the data only changes once per upstream load.
export const REFRESH_MS = 24 * 60 * 60 * 1000;

const BOOL_COLS = [
  'plumbing_customer', 'hvac_customer', 'electric_customer',
  'is_columbus_customer', 'is_dayton_customer',
  'is_cincinnati_customer', 'is_chillicothe_customer',
  'is_member', 'is_repeat_customer', 'has_email', 'has_mobile',
] as const;

function parseZip(address: unknown): string {
  if (!address) return MISSING;
  const m = ZIP_RE.exec(String(address));
  return m ? m[1] : MISSING;
}

function ones(n: number): Uint8Array {
  const a = new Uint8Array(n);
  a.fill(1);
  return a;
}

interface Clause {
  truth: Uint8Array;
  known: Uint8Array;
}

interface SnapshotInit {
  // Float64Array, not Int32Array: customer_id is a warehouse bigint and can exceed
  // 2^31. Float64 exactly represents every integer up to 2^53, covering any real id;
  // Int32 would silently wrap large ids (the Python original used int64).
  customerId: Float64Array;
  tradeMasks: Record<string, Uint8Array>;
  regionMasks: Record<string, Uint8Array>;
  flagMasks: Record<string, Uint8Array>;
  days: Float64Array;
  revenue: Float64Array;
  zips: string[];
  segments: Record<string, string[]>;
  tagIndex: Map<string, Int32Array>;
  availableSuppress: Set<string>;
  suppressedCount: number;
}

export class Snapshot {
  readonly customerId: Float64Array;
  readonly n: number;
  readonly tradeMasks: Record<string, Uint8Array>;
  readonly regionMasks: Record<string, Uint8Array>;
  readonly flagMasks: Record<string, Uint8Array>;
  readonly days: Float64Array;
  readonly revenue: Float64Array;
  readonly zips: string[];
  readonly segments: Record<string, string[]>;
  readonly tagIndex: Map<string, Int32Array>;
  readonly availableSuppress: Set<string>;
  readonly suppressedCount: number;

  private readonly _allTrue: Uint8Array;
  private readonly _daysKnown: Uint8Array;
  private readonly _revKnown: Uint8Array;
  private readonly _zipKnown: Uint8Array;
  private readonly _segKnown: Record<string, Uint8Array>;
  private readonly _tagMaskCache = new Map<string, Uint8Array>();

  constructor(init: SnapshotInit) {
    this.customerId = init.customerId;
    this.n = init.customerId.length;
    this.tradeMasks = init.tradeMasks;
    this.regionMasks = init.regionMasks;
    this.flagMasks = init.flagMasks;
    this.days = init.days;
    this.revenue = init.revenue;
    this.zips = init.zips;
    this.segments = init.segments;
    this.tagIndex = init.tagIndex;
    this.availableSuppress = init.availableSuppress;
    this.suppressedCount = init.suppressedCount;

    const n = this.n;
    this._allTrue = ones(n);
    this._daysKnown = new Uint8Array(n);
    this._revKnown = new Uint8Array(n);
    this._zipKnown = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this._daysKnown[i] = Number.isNaN(this.days[i]) ? 0 : 1;
      this._revKnown[i] = Number.isNaN(this.revenue[i]) ? 0 : 1;
      this._zipKnown[i] = this.zips[i] !== MISSING ? 1 : 0;
    }
    this._segKnown = {};
    for (const gkey of Object.keys(SEGMENT_COLUMNS)) {
      const arr = this.segments[gkey];
      const k = new Uint8Array(n);
      for (let i = 0; i < n; i++) k[i] = arr[i] !== MISSING ? 1 : 0;
      this._segKnown[gkey] = k;
    }
  }

  // ----------------------------------------------------------------- builders
  /** Build a snapshot from plain rows (no DB) — for tests. Mirrors from_warehouse:
   * opted-out customers (any do_not_* flag) are dropped up front. */
  static fromRows(rawRows: Row[], tagRows: Row[] = []): Snapshot {
    const optedOut = (r: Row) =>
      Boolean(r.do_not_mail) || Boolean(r.do_not_service) || Boolean(r.do_not_text);
    const suppressedCount = rawRows.filter(optedOut).length;
    const rows = rawRows.filter((r) => !optedOut(r));
    const n = rows.length;

    const customerId = new Float64Array(n);
    const colsBool: Record<string, Uint8Array> = {};
    for (const k of BOOL_COLS) colsBool[k] = new Uint8Array(n);
    const days = new Float64Array(n);
    const revenue = new Float64Array(n);
    const zips: string[] = new Array(n);
    const segCols: Record<string, string[]> = {};
    for (const col of Object.values(SEGMENT_COLUMNS)) segCols[col] = new Array(n);

    const idToRow = new Map<number, number>();
    rows.forEach((r, i) => {
      const cid = Number(r.customer_id);
      customerId[i] = cid;
      idToRow.set(cid, i);
      for (const k of BOOL_COLS) colsBool[k][i] = r[k] ? 1 : 0;
      const d = r.days_since_last_job;
      days[i] = d === null || d === undefined ? NaN : Number(d);
      const rev = r.lifetime_revenue;
      revenue[i] = rev === null || rev === undefined ? NaN : Number(rev);
      zips[i] = parseZip(r.address);
      for (const col of Object.values(SEGMENT_COLUMNS)) {
        const v = r[col];
        segCols[col][i] = v === null || v === undefined ? MISSING : String(v);
      }
    });

    return new Snapshot({
      customerId,
      tradeMasks: mapByName(TRADES, colsBool),
      regionMasks: mapByName(REGIONS, colsBool),
      flagMasks: flagMasksFrom(colsBool),
      days,
      revenue,
      zips,
      segments: segmentsByGroup(segCols),
      tagIndex: buildTagIndex(tagRows, idToRow),
      availableSuppress: new Set(Object.keys(SUPPRESS_SOURCE)),
      suppressedCount,
    });
  }

  /** Load the snapshot with two read-only queries (customers + job tags). */
  static async fromWarehouse(): Promise<Snapshot> {
    const present = await martColumns();
    const availableSuppress = new Set(
      Object.keys(SUPPRESS_SOURCE).filter((k) => present.has(SUPPRESS_SOURCE[k])),
    );
    // Per-key boolean expression, falling back to a constant when the backing column
    // isn't in the mart yet. TRUE => the customer opted out of that channel.
    const dnm = present.has('do_not_mail') ? 'do_not_mail is true' : 'false';
    const dns = present.has('do_not_service') ? 'do_not_service is true' : 'false';
    const dnt = present.has('do_not_text_numbers')
      ? "(do_not_text_numbers is not null and do_not_text_numbers <> '')"
      : 'false';

    const rows = await runQuery(
      `select
          customer_id,
          coalesce(plumbing_customer, 0) as plumbing_customer,
          coalesce(hvac_customer, 0)     as hvac_customer,
          coalesce(electric_customer, 0) as electric_customer,
          coalesce(is_columbus_customer, 0)    as is_columbus_customer,
          coalesce(is_dayton_customer, 0)      as is_dayton_customer,
          coalesce(is_cincinnati_customer, 0)  as is_cincinnati_customer,
          coalesce(is_chillicothe_customer, 0) as is_chillicothe_customer,
          coalesce(is_member, 0)          as is_member,
          coalesce(is_repeat_customer, 0) as is_repeat_customer,
          days_since_last_job,
          lifetime_revenue,
          address,
          lifetime_revenue_segment,
          frequency_segment,
          paid_recency_segment,
          (email is not null and email <> '')               as has_email,
          (phone_number is not null and phone_number <> '') as has_mobile
      from ${TABLE}
      where not (${dnm}) and not (${dns}) and not (${dnt})`,
    );

    const supp = await runQuery(
      `select count(*) as n from ${TABLE} where (${dnm}) or (${dns}) or (${dnt})`,
    );
    const suppressedCount = Number(supp[0]?.n ?? 0);

    const n = rows.length;
    const customerId = new Float64Array(n);
    const colsBool: Record<string, Uint8Array> = {};
    for (const k of BOOL_COLS) colsBool[k] = new Uint8Array(n);
    const days = new Float64Array(n);
    const revenue = new Float64Array(n);
    const zips: string[] = new Array(n);
    const segCols: Record<string, string[]> = {};
    for (const col of Object.values(SEGMENT_COLUMNS)) segCols[col] = new Array(n);

    const idToRow = new Map<number, number>();
    rows.forEach((r, i) => {
      const cid = Number(r.customer_id);
      customerId[i] = cid;
      idToRow.set(cid, i);
      for (const k of BOOL_COLS) colsBool[k][i] = r[k] ? 1 : 0;
      const d = r.days_since_last_job;
      days[i] = d === null || d === undefined ? NaN : Number(d);
      const rev = r.lifetime_revenue;
      revenue[i] = rev === null || rev === undefined ? NaN : Number(rev);
      zips[i] = parseZip(r.address);
      for (const col of Object.values(SEGMENT_COLUMNS)) {
        const v = r[col];
        segCols[col][i] = v === null || v === undefined ? MISSING : String(v);
      }
    });

    const tagIndex = await loadTagIndex(idToRow);
    return new Snapshot({
      customerId,
      tradeMasks: mapByName(TRADES, colsBool),
      regionMasks: mapByName(REGIONS, colsBool),
      flagMasks: flagMasksFrom(colsBool),
      days,
      revenue,
      zips,
      segments: segmentsByGroup(segCols),
      tagIndex,
      availableSuppress,
      suppressedCount,
    });
  }

  // --------------------------------------------------------------- filtering
  private tagMask(tag: string): Uint8Array {
    let m = this._tagMaskCache.get(tag);
    if (!m) {
      m = new Uint8Array(this.n);
      const idx = this.tagIndex.get(tag);
      if (idx) for (let j = 0; j < idx.length; j++) m[idx[j]] = 1;
      this._tagMaskCache.set(tag, m);
    }
    return m;
  }

  /** One (truth, known) pair per WHERE clause in `fset`, matching filterClauses. */
  private clauses(fset: FilterSet): Clause[] {
    const out: Clause[] = [];
    const n = this.n;
    const all = this._allTrue;
    const seg = fset as Record<string, unknown>;

    const trades = asList<string>(fset.trades).filter((t) => t in TRADES);
    if (trades.length) out.push({ truth: orMasks(trades.map((t) => this.tradeMasks[t]), n), known: all });

    const regions = asList<string>(fset.regions).filter((r) => r in REGIONS);
    if (regions.length) out.push({ truth: orMasks(regions.map((r) => this.regionMasks[r]), n), known: all });

    const rmin = num(fset.recencyMin);
    const rmax = num(fset.recencyMax);
    if (rmin !== null) {
      const t = Math.trunc(rmin);
      const truth = new Uint8Array(n);
      for (let i = 0; i < n; i++) truth[i] = this._daysKnown[i] && this.days[i] >= t ? 1 : 0;
      out.push({ truth, known: this._daysKnown });
    }
    if (rmax !== null) {
      const t = Math.trunc(rmax);
      const truth = new Uint8Array(n);
      for (let i = 0; i < n; i++) truth[i] = this._daysKnown[i] && this.days[i] <= t ? 1 : 0;
      out.push({ truth, known: this._daysKnown });
    }

    const zips = cleanZips(fset.zips);
    if (zips.length) {
      const set = new Set(zips);
      const truth = new Uint8Array(n);
      for (let i = 0; i < n; i++) truth[i] = set.has(this.zips[i]) ? 1 : 0;
      out.push({ truth, known: this._zipKnown });
    }

    const smin = num(fset.spendMin);
    const smax = num(fset.spendMax);
    if (smin !== null) {
      const truth = new Uint8Array(n);
      for (let i = 0; i < n; i++) truth[i] = this._revKnown[i] && this.revenue[i] >= smin ? 1 : 0;
      out.push({ truth, known: this._revKnown });
    }
    if (smax !== null) {
      const truth = new Uint8Array(n);
      for (let i = 0; i < n; i++) truth[i] = this._revKnown[i] && this.revenue[i] <= smax ? 1 : 0;
      out.push({ truth, known: this._revKnown });
    }

    for (const gkey of Object.keys(SEGMENT_COLUMNS)) {
      const vals = asList(seg[gkey]);
      if (vals.length) {
        const set = new Set(vals.map((v) => String(v)));
        const arr = this.segments[gkey];
        const truth = new Uint8Array(n);
        for (let i = 0; i < n; i++) truth[i] = set.has(arr[i]) ? 1 : 0;
        out.push({ truth, known: this._segKnown[gkey] });
      }
    }

    for (const flag of asList<string>(fset.flags)) {
      if (flag in FLAGS) out.push({ truth: this.flagMasks[flag], known: all });
    }

    const tags = asList<string>(fset.tags).filter((t) => this.tagIndex.has(t));
    if (tags.length) out.push({ truth: orMasks(tags.map((t) => this.tagMask(t)), n), known: all });

    return out;
  }

  /** Boolean mask of customers matching include AND not-any-exclude. */
  matchMask(payload: FilterPayload): Uint8Array {
    const n = this.n;
    const mask = Uint8Array.from(this._allTrue);
    for (const { truth } of this.clauses(payload)) {
      for (let i = 0; i < n; i++) mask[i] &= truth[i];
    }
    for (const { truth, known } of this.clauses(payload.exclude ?? {})) {
      for (let i = 0; i < n; i++) mask[i] &= known[i] && !truth[i] ? 1 : 0;
    }
    // Do-not-contact suppression is applied at load time (opted-out customers are never
    // in the snapshot), so there is nothing to mask here.
    return mask;
  }

  stats(mask: Uint8Array): AudienceStats {
    const n = this.n;
    const email = this.flagMasks.has_email;
    const mobile = this.flagMasks.has_mobile;
    let audience = 0;
    let reach = 0;
    let total = 0;
    let revCount = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      audience++;
      if (email[i] || mobile[i]) reach++;
      const rev = this.revenue[i];
      if (!Number.isNaN(rev)) {
        total += rev; // SQL avg/sum ignore NULLs
        revCount++;
      }
    }
    return {
      audienceCount: audience,
      reachCount: reach,
      avgValue: revCount ? total / revCount : 0,
      totalValue: revCount ? total : 0,
    };
  }

  /** customer_ids of matched rows, ascending by customer_id (order by customer_id asc
   * limit N). */
  topIds(mask: Uint8Array, limit: number): number[] {
    const idx: number[] = [];
    for (let i = 0; i < this.n; i++) if (mask[i]) idx.push(i);
    idx.sort((a, b) => this.customerId[a] - this.customerId[b]);
    return idx.slice(0, limit).map((i) => this.customerId[i]);
  }

  /** Every matched customer_id (uncapped) — for whole-audience actions (tag write-back). */
  matchedIds(mask: Uint8Array): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) if (mask[i]) out.push(this.customerId[i]);
    return out;
  }

  /** Per-option counts that ignore the option's own group but honor every other active
   * filter — same behavior as the SQL facet_counts. Tags are intentionally omitted. */
  facetCounts(payload: FilterPayload): FacetCounts {
    const mode = payload.mode || 'include';
    const baseMaskFor = (gkey: string): Uint8Array => {
      let p: FilterPayload;
      if (mode === 'exclude') {
        const ex = { ...(payload.exclude ?? {}) } as Record<string, unknown>;
        delete ex[gkey];
        p = { ...payload, exclude: ex as FilterSet };
      } else {
        const copy = { ...payload } as Record<string, unknown>;
        delete copy[gkey];
        p = { ...(copy as FilterPayload), exclude: payload.exclude ?? {} };
      }
      return this.matchMask(p);
    };

    const out: FacetCounts = {};
    for (const [gkey, masks] of [
      ['trades', this.tradeMasks],
      ['regions', this.regionMasks],
    ] as const) {
      const base = baseMaskFor(gkey);
      out[gkey] = {};
      for (const [name, m] of Object.entries(masks)) out[gkey][name] = andCount(base, m);
    }

    for (const gkey of Object.keys(SEGMENT_COLUMNS)) {
      const base = baseMaskFor(gkey);
      const arr = this.segments[gkey];
      out[gkey] = {};
      for (const v of this.segmentValues(gkey)) {
        let c = 0;
        for (let i = 0; i < this.n; i++) if (base[i] && arr[i] === v) c++;
        out[gkey][v] = c;
      }
    }

    const baseFlags = baseMaskFor('flags');
    out.flags = {};
    for (const [name, m] of Object.entries(this.flagMasks)) out.flags[name] = andCount(baseFlags, m);
    return out;
  }

  // ---------------------------------------------------------------- facets
  private segmentValues(gkey: string): string[] {
    const arr = this.segments[gkey];
    const set = new Set<string>();
    for (const v of arr) if (v !== MISSING) set.add(v);
    return [...set].sort();
  }

  /** Global facet metadata (unfiltered totals) for /api/facets. */
  baseFacets(): Facets {
    const segs: Record<string, { value: string; count: number }[]> = {};
    for (const gkey of Object.keys(SEGMENT_COLUMNS)) {
      const arr = this.segments[gkey];
      const tally = new Map<string, number>();
      for (const v of arr) if (v !== MISSING) tally.set(v, (tally.get(v) ?? 0) + 1);
      segs[gkey] = [...tally.keys()]
        .sort()
        .map((value) => ({ value, count: tally.get(value)! }));
    }
    return {
      baseCount: this.n,
      trades: Object.entries(this.tradeMasks).map(([value, m]) => ({ value, count: popcount(m) })),
      regions: Object.entries(this.regionMasks).map(([value, m]) => ({ value, count: popcount(m) })),
      segments: segs,
      flags: Object.fromEntries(Object.entries(this.flagMasks).map(([k, m]) => [k, popcount(m)])),
      // Opt-outs are dropped at load, so suppression is not a facet — but we report the
      // count removed so the UI can show how many were excluded.
      suppressedCount: this.suppressedCount,
    };
  }

  /** The job-tag universe with each tag's distinct-customer reach, reach desc. */
  tagFacets(): { value: string; count: number }[] {
    const items = [...this.tagIndex.entries()].map(([value, idx]) => ({ value, count: idx.length }));
    // Tiebreak by raw code-point order (matching Python's `value` string sort), NOT
    // localeCompare — localeCompare is case-insensitive/locale-aware and would reorder
    // equal-count tags differently from the original.
    items.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
    return items;
  }

  /** The valid-tag vocabulary (tag index keys) — feeds audienceQuery's tag validation. */
  tagValues(): Set<string> {
    return new Set(this.tagIndex.keys());
  }
}

// ----------------------------------------------------------------- helpers
function mapByName(names: Record<string, string>, cols: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const [name, col] of Object.entries(names)) out[name] = cols[col];
  return out;
}

function flagMasksFrom(cols: Record<string, Uint8Array>): Record<string, Uint8Array> {
  return {
    has_email: cols.has_email,
    has_mobile: cols.has_mobile,
    is_member: cols.is_member,
    is_repeat_customer: cols.is_repeat_customer,
  };
}

function segmentsByGroup(segCols: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [gkey, col] of Object.entries(SEGMENT_COLUMNS)) out[gkey] = segCols[col];
  return out;
}

function buildTagIndex(tagRows: Row[], idToRow: Map<number, number>): Map<string, Int32Array> {
  const buckets = new Map<string, number[]>();
  for (const p of tagRows) {
    const row = idToRow.get(Number(p.customer_id));
    if (row !== undefined) {
      const tag = String(p.tag);
      const b = buckets.get(tag);
      if (b) b.push(row);
      else buckets.set(tag, [row]);
    }
  }
  const out = new Map<string, Int32Array>();
  for (const [tag, idx] of buckets) out.set(tag, Int32Array.from(idx));
  return out;
}

function orMasks(masks: Uint8Array[], n: number): Uint8Array {
  const m = new Uint8Array(n);
  for (const src of masks) for (let i = 0; i < n; i++) m[i] |= src[i];
  return m;
}

function popcount(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

function andCount(a: Uint8Array, b: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) c += a[i] & b[i];
  return c;
}

async function martColumns(): Promise<Set<string>> {
  const [schema, name] = TABLE.split('.');
  const rows = await runQuery(
    'select column_name from information_schema.columns ' +
      'where table_schema = $1 and table_name = $2',
    [schema, name],
  );
  return new Set(rows.map((r) => String(r.column_name)));
}

async function loadTagIndex(idToRow: Map<number, number>): Promise<Map<string, Int32Array>> {
  const pairs = await runQuery(
    `select customer_id, trim(t) as tag
       from ${JOBS_TABLE}
       cross join unnest(string_to_array(tags, ',')) as t
       where tags is not null and tags <> '' and trim(t) <> ''
       group by 1, 2`,
  );
  return buildTagIndex(pairs, idToRow);
}
