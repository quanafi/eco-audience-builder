/**
 * Fixed prop contracts shared by the foundation STUB components and the real
 * implementations that Wave-2 UI workers drop in. A worker replaces exactly one stub
 * file; as long as it honors the matching interface here, AudienceBuilder keeps working
 * and the build stays green.
 */
import type { EditableSet } from '../lib/editableSet';
import type {
  AudienceResponse,
  Config,
  Facets,
  FacetCounts,
  FilterPayload,
  PreviewRow,
} from '../lib/types';

/**
 * All filter sections share this contract. `set` is the set currently being edited
 * (include or exclude); call `onChange` with the next set to mutate it and trigger a
 * debounced refresh.
 *
 * Data sources (use the right one — they don't overlap):
 *  - `facets` is the canonical source for filter OPTIONS + base counts. Trade/region
 *    chips come from `facets.trades` / `facets.regions` (each {value,count}); segment
 *    options from `facets.segments[groupKey]`; the tag universe from `facets.tags`.
 *  - `facetCounts` carries live per-option counts for the current selection (null until
 *    the first result) — overlay these onto the base counts.
 *  - `config` carries only the backend LABELS/keys: `config.flags` ({f,label}) for the
 *    reachability chips, `config.segmentGroups` ({key,label}) for segment group headings.
 *    Do NOT build trade/region chips from `config.trades`/`config.regions` — those are
 *    name-only and empty until /api/config resolves; use `facets`.
 */
export interface FilterSectionProps {
  set: EditableSet;
  facets: Facets;
  facetCounts: FacetCounts | null;
  config: Config;
  onChange: (next: EditableSet) => void;
}

/** Stats + charts strip. `data` is the latest audience result (null before first load). */
export interface StatsChartsProps {
  data: AudienceResponse | null;
}

/** Audience preview table. */
export interface PreviewTableProps {
  rows: PreviewRow[];
  audienceCount: number;
  loading: boolean;
  error: string | null;
}

/** Generated-SQL view (copy button + SELECT-only tag). */
export interface SqlViewProps {
  sql: string;
}

/** Save / load saved audiences. `onLoad` rehydrates the builder from a saved payload. */
export interface SavePanelProps {
  payload: FilterPayload;
  onLoad: (filters: FilterPayload) => void;
}

/** ServiceTitan tag write-back. `lastCount` is the current audience size (for the hint). */
export interface TagPanelProps {
  payload: FilterPayload;
  lastCount: number | null;
}

/** CSV/xlsx export (format + column picker + download). */
export interface ExportPanelProps {
  payload: FilterPayload;
}

/** Send-to-ads (platform, estimate, dry-run send). `lastCount` is the current audience size (for the pre-send confirm summary). */
export interface AdsPanelProps {
  payload: FilterPayload;
  lastCount: number | null;
}
