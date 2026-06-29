/**
 * Saved audiences — PROTOTYPE (mock) store. Port of app/audiences.py.
 *
 * An "audience" is fully described by the filter JSON the frontend already sends to
 * /api/audience (see the legacy static/app.js `payload()`): an include set + nested
 * `exclude` set + `mode`. We persist the *filter definition only* — reopening re-runs
 * it live against the current snapshot, so membership always reflects today's data.
 *
 * TODO (post-migration): replace this in-memory list with Firestore — one document
 * per audience, `audiences/{autoId} = {name, filters, ownerEmail, createdAt,
 * updatedAt}`. `ownerEmail` comes from the auth layer (IAP/SSO verified email) and
 * scopes each user's list; it's also the seam for future sharing. Nothing here writes
 * to the read-only warehouse.
 */
import type { FilterPayload, FilterSet, SavedAudience } from './types';

/**
 * Build a complete filter payload (the shape `payload()` sends) from the include
 * fields given, with empty defaults so saved samples round-trip cleanly through the
 * frontend's setFromPayload(). Mirrors app/audiences.py `_filters`.
 */
function emptySet(): FilterSet {
  return {
    trades: [],
    regions: [],
    recencyMin: null,
    recencyMax: null,
    zips: '',
    spendMin: null,
    spendMax: null,
    revenueSegments: [],
    frequencySegments: [],
    recencySegments: [],
    flags: [],
    tags: [],
  };
}

function filters(
  include: FilterSet = {},
  mode: 'include' | 'exclude' = 'include',
): FilterPayload {
  return { ...emptySet(), ...include, exclude: emptySet(), mode };
}

// Seeded sample audiences using real, valid filter values (trades, regions and flags
// mirror the allow-lists in audienceQuery.ts) so "Load" works end-to-end in the
// prototype. Replaced by per-user Firestore documents after migration.
const SAMPLES: SavedAudience[] = [
  {
    id: 'sample-lapsed-plumbing-columbus',
    name: 'Lapsed Plumbing — Columbus',
    filters: filters({
      trades: ['Plumbing'],
      regions: ['Columbus'],
      recencyMin: 365,
      recencyMax: 1095,
      flags: ['has_email'],
    }),
    createdAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'sample-highvalue-hvac-members',
    name: 'High-value HVAC members',
    filters: filters({
      trades: ['HVAC'],
      spendMin: 5000,
      flags: ['is_member', 'has_email'],
    }),
    createdAt: '2026-06-10T00:00:00Z',
  },
  {
    id: 'sample-reachable-repeat',
    name: 'Reachable repeat customers',
    filters: filters({ flags: ['is_repeat_customer', 'has_mobile'] }),
    createdAt: '2026-06-18T00:00:00Z',
  },
];

/** Deep-ish clone so callers can't mutate the store's records. */
function clone(a: SavedAudience): SavedAudience {
  return { ...a, filters: structuredClone(a.filters) };
}

// In-memory store for the prototype. Resets on restart and is shared across all users
// (no identity yet). Firestore replaces this.
const audiences: SavedAudience[] = SAMPLES.map(clone);
let idSeq = 0;

/** All saved audiences. TODO: scope by ownerEmail once auth exists. */
export function listAudiences(): SavedAudience[] {
  return audiences.map(clone);
}

/** Response shape of POST /api/audiences (port of app/server.py save_audience). */
export interface SaveAudienceResult {
  ok: true;
  id: string;
  audience: SavedAudience;
  message: string;
}

/**
 * Append a saved audience to the mock store and return the created record.
 *
 * TODO (post-migration): write to Firestore with a server timestamp and the
 * authenticated ownerEmail instead of this in-memory append.
 */
export function saveAudience(
  name: string,
  filters: FilterPayload | null | undefined,
): SaveAudienceResult {
  const cleanName = (name ?? '').trim() || 'Untitled audience';
  const record: SavedAudience = {
    id: `local-${(idSeq += 1)}`,
    name: cleanName,
    filters: (filters ?? {}) as FilterPayload,
    createdAt: null, // TODO: Firestore server timestamp
  };
  audiences.push(record);
  return {
    ok: true,
    id: record.id,
    audience: clone(record),
    message: `Saved '${cleanName}' (placeholder — will persist to Firestore after migration).`,
  };
}
