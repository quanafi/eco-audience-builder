/**
 * Shared types for the Audience Builder. The filter payload mirrors the JSON the
 * frontend sends to /api/audience (see the legacy static/app.js `payload()`): an
 * include set at the top level, a nested `exclude` set, and a `mode`.
 */

/** One filter set (include OR exclude). All fields optional; absent = no constraint. */
export interface FilterSet {
  trades?: string[];
  regions?: string[];
  recencyMin?: number | string | null;
  recencyMax?: number | string | null;
  zips?: string | string[];
  spendMin?: number | string | null;
  spendMax?: number | string | null;
  revenueSegments?: string[];
  frequencySegments?: string[];
  recencySegments?: string[];
  flags?: string[];
  tags?: string[];
}

/** The full payload: include fields at top level + nested exclude + mode. */
export interface FilterPayload extends FilterSet {
  exclude?: FilterSet;
  mode?: 'include' | 'exclude';
}

/** A single preview-table row (shape of audience_query._present_row). */
export interface PreviewRow {
  customer_id: number;
  name: string;
  city: string;
  zip: string;
  state: string;
  primary_trade: string;
  lifetime_jobs: number;
  lifetime_revenue: number;
  last_completed_job: string | null;
  days_since_last_job: number | null;
  segment: string;
  is_member: boolean;
  has_email: boolean;
  has_mobile: boolean;
  is_repeat_customer: boolean;
}

/** Per-option counts keyed by group then value (snapshot.facetCounts). */
export type FacetCounts = Record<string, Record<string, number>>;

/** Aggregate stats for a matched mask (snapshot.stats). */
export interface AudienceStats {
  audienceCount: number;
  reachCount: number;
  avgValue: number;
  totalValue: number;
}

/** Response from POST /api/audience (audience_query.run_audience). */
export interface AudienceResponse extends AudienceStats {
  baseCount: number;
  pctBase: number;
  rows: PreviewRow[];
  sql: string;
  limited: boolean;
  facetCounts: FacetCounts;
}

export interface FacetOption {
  value: string;
  count: number;
}

/** Global facet totals from GET /api/facets (snapshot.baseFacets). */
export interface Facets {
  baseCount: number;
  trades: FacetOption[];
  regions: FacetOption[];
  segments: Record<string, FacetOption[]>;
  flags: Record<string, number>;
  suppressedCount: number;
  /** Merged client-side from GET /api/tags (loaded separately). */
  tags?: FacetOption[];
}

/** GET /api/config — canonical filter vocabulary (audience_query.filterConfig). */
export interface Config {
  flags: { f: string; label: string }[];
  trades: string[];
  regions: string[];
  segmentGroups: { key: string; label: string }[];
}

/** Identifier coverage for an audience (ads_normalize.coverage). */
export interface Coverage {
  total: number;
  hasEmail: number;
  hasPhone: number;
  hasNameZip: number;
  hasAnyIdentifier: number;
}

/** Per-platform predicted match-rate range (ads_normalize.estimateMatchRate). */
export interface MatchRateEstimate {
  lowPct: number;
  highPct: number;
  lowCount: number;
  highCount: number;
  basis: string;
  disclaimer: string;
}

export interface AdsEstimate {
  audienceCount: number;
  coverage: Coverage;
  platforms: Record<string, MatchRateEstimate>;
}

/** A saved audience record (audiences mock store). */
export interface SavedAudience {
  id: string;
  name: string;
  filters: FilterPayload;
  createdAt: string | null;
}

/** A raw DB row. */
export type Row = Record<string, unknown>;
