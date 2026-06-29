/**
 * Audience query orchestration (port of app/audience_query.py `run_audience` +
 * `_fetch_preview_rows`).
 *
 * Filtering, stats and facet counts come from the in-memory snapshot (no per-keystroke
 * warehouse scans); only the ≤ROW_LIMIT preview detail rows are fetched from the
 * warehouse, by id. The displayed copy-paste SQL still comes from buildDisplaySql, so it
 * stays an accurate description of the equivalent query.
 *
 * `pg` POSITIONAL binds: the preview fetch uses `customer_id = any($1)` with the id array
 * passed directly as the single bind value (the Python original used a named `:ids` bind).
 */
import {
  PREVIEW_SELECT_LIST,
  ROW_LIMIT,
  buildDisplaySql,
  buildSelect,
  presentRow,
} from './audienceQuery';
import { runQuery } from './db';
import { getSnapshot } from './snapshotStore';
import type { AudienceResponse, FilterPayload, PreviewRow, Row } from './types';

/**
 * Fetch display detail for the given customer_ids and return them in `ids` order
 * (ascending customer_id, as chosen in-memory). One indexed lookup of ≤ROW_LIMIT ids —
 * the only DB round-trip per audience query now that filtering, stats and facet counts
 * are computed from the in-memory snapshot. Mirrors `_fetch_preview_rows`.
 */
export async function fetchPreviewRows(ids: number[]): Promise<PreviewRow[]> {
  if (!ids.length) return [];
  const sql = buildSelect(PREVIEW_SELECT_LIST, '\nwhere customer_id = any($1)');
  const rows = await runQuery(sql, [ids]);
  const byId = new Map<number, Row>();
  for (const r of rows) byId.set(Number(r.customer_id), r);
  const out: PreviewRow[] = [];
  for (const i of ids) {
    const r = byId.get(i);
    if (r !== undefined) out.push(presentRow(r));
  }
  return out;
}

/**
 * Stats + preview rows + facet counts for the given filters (port of `run_audience`).
 *
 * The snapshot supplies the always-on do-not-contact suppression gating via
 * `availableSuppress`, passed to buildDisplaySql so the displayed SQL excludes exactly
 * the channels the live mart has columns for.
 */
export async function runAudience(payload: FilterPayload): Promise<AudienceResponse> {
  const snap = await getSnapshot();
  const mask = snap.matchMask(payload);
  const stats = snap.stats(mask);
  const audience = stats.audienceCount;

  const rows = await fetchPreviewRows(snap.topIds(mask, ROW_LIMIT));
  const base = snap.n;

  return {
    audienceCount: audience,
    reachCount: stats.reachCount,
    avgValue: stats.avgValue,
    totalValue: stats.totalValue,
    baseCount: base || 0,
    pctBase: base ? (audience / base) * 100 : 0,
    rows,
    sql: buildDisplaySql(payload, snap.availableSuppress),
    limited: audience > ROW_LIMIT,
    facetCounts: snap.facetCounts(payload),
  };
}
