/**
 * The editable UI filter-set shape and its conversion to/from the API payload
 * (ported from static/app.js: emptySet / setPayload / payload / setFromPayload).
 *
 * EditableSet is richer than the API FilterSet: it remembers which recency/spend preset
 * button was clicked. setPayload resolves those to recencyMin/Max + spendMin; loading a
 * saved audience reverse-maps the numbers back to the preset buttons.
 */
import { RECENCY, SPEND_PRESETS } from './uiVocab';
import type { FilterPayload, FilterSet } from './types';

export interface EditableSet {
  trades: string[];
  regions: string[];
  recency: string; // preset key: 'any' | '90' | '180' | '365' | 'lapsed' | 'custom'
  recMin: number | null;
  recMax: number | null;
  zips: string;
  spendMin: number | null;
  spendMax: number | null;
  spendPreset: string | null;
  revenueSegments: string[];
  frequencySegments: string[];
  recencySegments: string[];
  flags: string[];
  tags: string[];
}

export function emptySet(): EditableSet {
  return {
    trades: [], regions: [],
    recency: 'any', recMin: null, recMax: null,
    zips: '', spendMin: null, spendMax: null, spendPreset: null,
    revenueSegments: [], frequencySegments: [], recencySegments: [],
    flags: [], tags: [],
  };
}

/** Resolve one EditableSet into the API FilterSet (recency preset -> min/max). */
export function setPayload(s: EditableSet): FilterSet {
  const r = RECENCY.find((x) => x.k === s.recency);
  let recencyMin: number | null = null;
  let recencyMax: number | null = null;
  if (s.recency === 'custom') {
    recencyMin = s.recMin;
    recencyMax = s.recMax;
  } else {
    recencyMin = r?.min ?? null;
    recencyMax = r?.max ?? null;
  }
  return {
    trades: s.trades,
    regions: s.regions,
    recencyMin,
    recencyMax,
    zips: s.zips,
    spendMin: s.spendMin,
    spendMax: s.spendMax,
    revenueSegments: s.revenueSegments,
    frequencySegments: s.frequencySegments,
    recencySegments: s.recencySegments,
    flags: s.flags,
    tags: s.tags,
  };
}

/** Build the full payload: include fields at top level + nested exclude + mode. */
export function buildPayload(
  sets: { include: EditableSet; exclude: EditableSet },
  mode: 'include' | 'exclude',
): FilterPayload {
  return { ...setPayload(sets.include), exclude: setPayload(sets.exclude), mode };
}

// ---- inverse of setPayload(): rehydrate UI state from a saved filter payload ----
function recencyKeyFromMinMax(min: unknown, max: unknown): string {
  const m = min == null ? null : Number(min);
  const x = max == null ? null : Number(max);
  const found = RECENCY.find((r) => r.k !== 'custom' && (r.min ?? null) === m && (r.max ?? null) === x);
  if (found) return found.k; // 'any' when both null
  return m == null && x == null ? 'any' : 'custom';
}

function spendPresetFromMinMax(min: number | null, max: number | null): string | null {
  if (max != null || min == null) return null; // presets are min-only ($500+, …)
  const p = SPEND_PRESETS.find((pr) => pr.min === Number(min));
  return p ? p.label : null;
}

export function setFromPayload(p: FilterSet = {}): EditableSet {
  const recency = recencyKeyFromMinMax(p.recencyMin, p.recencyMax);
  const spendMin = (p.spendMin ?? null) as number | null;
  const spendMax = (p.spendMax ?? null) as number | null;
  return {
    trades: [...(p.trades ?? [])],
    regions: [...(p.regions ?? [])],
    recency,
    recMin: recency === 'custom' ? ((p.recencyMin ?? null) as number | null) : null,
    recMax: recency === 'custom' ? ((p.recencyMax ?? null) as number | null) : null,
    zips: typeof p.zips === 'string' ? p.zips : Array.isArray(p.zips) ? p.zips.join(', ') : '',
    spendMin,
    spendMax,
    spendPreset: spendPresetFromMinMax(spendMin, spendMax),
    revenueSegments: [...(p.revenueSegments ?? [])],
    frequencySegments: [...(p.frequencySegments ?? [])],
    recencySegments: [...(p.recencySegments ?? [])],
    flags: [...(p.flags ?? [])],
    tags: [...(p.tags ?? [])],
  };
}

/** Count of active filters in one section (drives the collapsed-section badge). */
export function sectionActiveCount(key: string, s: EditableSet): number {
  switch (key) {
    case 'trades':
      return s.trades.length;
    case 'recency':
      return s.recency !== 'any' ? 1 : 0;
    case 'regions':
      return s.regions.length;
    case 'zip':
      return s.zips.split(/[\s,]+/).some((z) => /^\d{5}$/.test(z.trim())) ? 1 : 0;
    case 'spend':
      return s.spendMin != null || s.spendMax != null ? 1 : 0;
    case 'segments':
      return s.revenueSegments.length + s.frequencySegments.length + s.recencySegments.length;
    case 'tags':
      return s.tags.length;
    case 'flags':
      return s.flags.length;
    default:
      return 0;
  }
}

/** Total active filters across the whole set (drives the mode-toggle count badges). */
export function setActiveCount(s: EditableSet): number {
  const zl = s.zips.split(/[\s,]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  return (
    s.trades.length +
    s.regions.length +
    s.flags.length +
    s.tags.length +
    s.revenueSegments.length +
    s.frequencySegments.length +
    s.recencySegments.length +
    (s.recency !== 'any' ? 1 : 0) +
    (zl.length ? 1 : 0) +
    (s.spendMin != null || s.spendMax != null ? 1 : 0)
  );
}
