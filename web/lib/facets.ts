/**
 * Facet metadata for the filter UI: the real segment values and base counts.
 *
 * Port of app/facets.py. Both the global facet totals and the job-tag universe are
 * simple aggregates over the in-memory snapshot's columns (web/lib/snapshot.ts), so the
 * filter chips reflect exactly the data the snapshot filters against — no warehouse
 * round-trip, and no separate slow tag query.
 */
import { getSnapshot } from './snapshotStore';
import type { Facets, FacetOption } from './types';

/** Global (unfiltered) facet totals for GET /api/facets. */
export async function getFacets(): Promise<Facets> {
  const snap = await getSnapshot();
  return snap.baseFacets();
}

/** The job-tag universe: every tag with its distinct-customer reach, reach desc. */
export async function getTagFacets(): Promise<FacetOption[]> {
  const snap = await getSnapshot();
  return snap.tagFacets();
}
