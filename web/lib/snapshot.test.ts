/**
 * Tests for the in-memory snapshot filter/stat/facet engine (port of
 * tests/test_snapshot.py). Builds a small Snapshot via Snapshot.fromRows (no DB) and
 * asserts match/stats/facets reproduce the SQL semantics, including the three-valued
 * logic of the negated exclude set.
 */
import { describe, it, expect } from 'vitest';
import { Snapshot } from './snapshot';
import type { Row } from './types';

const DEFAULTS: Row = {
  plumbing_customer: 0, hvac_customer: 0, electric_customer: 0,
  is_columbus_customer: 0, is_dayton_customer: 0,
  is_cincinnati_customer: 0, is_chillicothe_customer: 0,
  is_member: 0, is_repeat_customer: 0,
  days_since_last_job: null, lifetime_revenue: null, address: null,
  lifetime_revenue_segment: null, frequency_segment: null,
  paid_recency_segment: null, has_email: false, has_mobile: false,
  do_not_mail: false, do_not_service: false, do_not_text: false,
};

const row = (customer_id: number, over: Row = {}): Row => ({ customer_id, ...DEFAULTS, ...over });

function ids(snap: Snapshot, mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < snap.n; i++) if (mask[i]) out.push(snap.customerId[i]);
  return out.sort((a, b) => a - b);
}

function build(): Snapshot {
  const rows: Row[] = [
    row(1, { plumbing_customer: 1, is_columbus_customer: 1, is_member: 1, has_email: true,
      lifetime_revenue: 1000, days_since_last_job: 10, address: '1 A St, Columbus, OH 43215',
      lifetime_revenue_segment: 'High' }),
    row(2, { hvac_customer: 1, is_dayton_customer: 1, has_mobile: true,
      lifetime_revenue: 5000, days_since_last_job: 100, address: '2 B St, Dayton, OH 45402',
      lifetime_revenue_segment: 'Mid' }),
    row(3, { electric_customer: 1, address: 'no zip here' }),
    row(4, { plumbing_customer: 1, hvac_customer: 1, is_columbus_customer: 1, is_member: 1,
      has_email: true, lifetime_revenue: 3000, days_since_last_job: 5,
      address: '4 D St, Columbus, OH 43215', lifetime_revenue_segment: 'High' }),
  ];
  const tagRows: Row[] = [
    { customer_id: 1, tag: 'VIP' },
    { customer_id: 2, tag: 'Repair' },
    { customer_id: 4, tag: 'VIP' },
    { customer_id: 4, tag: 'Install' },
  ];
  return Snapshot.fromRows(rows, tagRows);
}

describe('empty / no-op', () => {
  it('empty payload matches everyone', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({}))).toEqual([1, 2, 3, 4]);
  });
});

describe('OR within a group, AND across groups', () => {
  it('trades OR within group', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ trades: ['Plumbing', 'HVAC'] }))).toEqual([1, 2, 4]);
  });
  it('unknown trade ignored', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ trades: ['Plumbing', 'Telepathy'] }))).toEqual([1, 4]);
  });
  it('trade AND region are ANDed', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ trades: ['Plumbing'], regions: ['Columbus'] }))).toEqual([1, 4]);
  });
  it('multiple flags are ANDed', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ flags: ['is_member', 'has_email'] }))).toEqual([1, 4]);
  });
});

describe('numeric ranges (null-aware)', () => {
  it('recency range excludes null days', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ recencyMin: 1, recencyMax: 50 }))).toEqual([1, 4]);
  });
  it('spend min excludes null revenue', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ spendMin: 2000 }))).toEqual([2, 4]);
  });
});

describe('zips parsed from address', () => {
  it('zip membership from parsed address', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ zips: ['43215'] }))).toEqual([1, 4]);
  });
});

describe('segments', () => {
  it('segment membership', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ revenueSegments: ['High'] }))).toEqual([1, 4]);
  });
});

describe('tags: union + vocabulary validation', () => {
  it('tag union and unknown tag ignored', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ tags: ['VIP', 'NotARealTag'] }))).toEqual([1, 4]);
    expect(ids(snap, snap.matchMask({ tags: ['VIP', 'Repair'] }))).toEqual([1, 2, 4]);
  });
  it('only unknown tags means no tag clause', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ tags: ['NotARealTag'] }))).toEqual([1, 2, 3, 4]);
  });
});

describe('exclude set: negation + three-valued logic', () => {
  it('exclude negates clause', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ exclude: { regions: ['Columbus'] } }))).toEqual([2, 3]);
  });
  it('exclude on nullable column drops null rows', () => {
    const snap = build();
    // not (days <= 50): row 3 (null days) -> predicate NULL -> dropped. Only row 2 survives.
    expect(ids(snap, snap.matchMask({ exclude: { recencyMax: 50 } }))).toEqual([2]);
  });
  it('include and exclude combined', () => {
    const snap = build();
    expect(ids(snap, snap.matchMask({ trades: ['Plumbing'], exclude: { tags: ['VIP'] } }))).toEqual([]);
  });
});

describe('do-not-contact suppression (always-on baseline exclusion)', () => {
  const suppressSnap = () =>
    Snapshot.fromRows([
      row(1),
      row(2, { do_not_mail: true }),
      row(3, { do_not_text: true }),
      row(4, { do_not_service: true }),
    ]);

  it('opted-out customers never enter the snapshot', () => {
    const snap = suppressSnap();
    expect(snap.n).toBe(1);
    expect(ids(snap, snap.matchMask({}))).toEqual([1]);
  });
  it('payload cannot resurrect opted-out customers', () => {
    const snap = suppressSnap();
    expect(ids(snap, snap.matchMask({ trades: [], exclude: {} }))).toEqual([1]);
  });
  it('base facets count only contactable customers', () => {
    const snap = suppressSnap();
    const bf = snap.baseFacets();
    expect(bf.baseCount).toBe(1);
    expect('suppress' in bf).toBe(false);
    expect(snap.suppressedCount).toBe(3);
    expect(bf.suppressedCount).toBe(3);
  });
});

describe('stats', () => {
  it('ignore null revenue in avg and sum', () => {
    const snap = build();
    const s = snap.stats(snap.matchMask({}));
    expect(s.audienceCount).toBe(4);
    expect(s.reachCount).toBe(3);
    expect(s.totalValue).toBe(9000);
    expect(s.avgValue).toBe(3000);
  });
  it('empty mask is zeroed', () => {
    const snap = build();
    const s = snap.stats(new Uint8Array(snap.n));
    expect(s).toEqual({ audienceCount: 0, reachCount: 0, avgValue: 0, totalValue: 0 });
  });
});

describe('top_ids ordering', () => {
  it('ascending customer_id', () => {
    const snap = build();
    const mask = snap.matchMask({});
    expect(snap.topIds(mask, 10)).toEqual([1, 2, 3, 4]);
    expect(snap.topIds(mask, 2)).toEqual([1, 2]);
  });
  it('preserves customer_ids beyond 2^31 (no Int32 truncation)', () => {
    const big = 3_000_000_000; // > 2^31; would wrap negative in an Int32Array
    const snap = Snapshot.fromRows([row(big, { plumbing_customer: 1 })]);
    const mask = snap.matchMask({});
    expect(snap.topIds(mask, 10)).toEqual([big]);
    expect(snap.matchedIds(mask)).toEqual([big]);
  });
});

describe('facet counts', () => {
  it('ignore own group but honor others', () => {
    const snap = build();
    const fc = snap.facetCounts({ trades: ['Plumbing'] });
    expect(fc.regions.Columbus).toBe(2);
    expect(fc.regions.Dayton).toBe(0);
    expect(fc.trades.Plumbing).toBe(2);
    expect(fc.trades.HVAC).toBe(2);
    expect(fc.trades.Electric).toBe(1);
    expect('tags' in fc).toBe(false);
  });
});

describe('base + tag facets', () => {
  it('base facet totals', () => {
    const snap = build();
    const bf = snap.baseFacets();
    expect(bf.baseCount).toBe(4);
    expect(bf.suppressedCount).toBe(0);
    expect(Object.fromEntries(bf.trades.map((o) => [o.value, o.count]))).toEqual({
      Plumbing: 2, HVAC: 2, Electric: 1,
    });
    expect(bf.flags.is_member).toBe(2);
    expect(Object.fromEntries(bf.segments.revenueSegments.map((o) => [o.value, o.count]))).toEqual({
      High: 2, Mid: 1,
    });
  });
  it('tag facets sorted by reach desc', () => {
    const snap = build();
    const tf = snap.tagFacets();
    expect(tf[0]).toEqual({ value: 'VIP', count: 2 });
    expect(new Set(tf.map((o) => o.value))).toEqual(new Set(['VIP', 'Repair', 'Install']));
  });
  it('tag facets break count ties by code-point order, not locale', () => {
    // Equal counts → code-point order: 'ABC'(A=65) < '_x'(_=95) < 'abc'(a=97).
    // localeCompare would reorder these.
    const snap = Snapshot.fromRows(
      [row(1), row(2), row(3)],
      [
        { customer_id: 1, tag: 'abc' },
        { customer_id: 2, tag: 'ABC' },
        { customer_id: 3, tag: '_x' },
      ],
    );
    expect(snap.tagFacets().map((o) => o.value)).toEqual(['ABC', '_x', 'abc']);
  });
});
