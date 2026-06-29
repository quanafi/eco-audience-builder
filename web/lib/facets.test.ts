/**
 * Tests for the read endpoints (GET /api/config, /api/facets, /api/tags) and the thin
 * facets lib. Port of the config/facets/tags slices of tests/test_endpoints.py.
 *
 * The snapshot store is the only DB seam: a prebuilt Snapshot (via Snapshot.fromRows) is
 * injected with __setSnapshotForTest, so these run without a warehouse. We assert the JSON
 * shapes and that errors map to 400 (ValidationError) / 500 (anything else), mirroring the
 * centralized error contract in web/lib/errors.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Snapshot } from './snapshot';
import { __setSnapshotForTest } from './snapshotStore';
import { getFacets, getTagFacets } from './facets';
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

function snap(): Snapshot {
  return Snapshot.fromRows(
    [
      row(1, { plumbing_customer: 1, has_email: true, lifetime_revenue: 1000, days_since_last_job: 10 }),
      row(2, { hvac_customer: 1, has_mobile: true, lifetime_revenue: 5000, days_since_last_job: 50 }),
    ],
    [
      { customer_id: 1, tag: 'Spring promo' },
      { customer_id: 2, tag: 'Spring promo' },
      { customer_id: 1, tag: 'VIP' },
    ],
  );
}

afterEach(() => {
  __setSnapshotForTest(null);
  vi.restoreAllMocks();
});

// --- facets lib ----------------------------------------------------------
describe('getFacets', () => {
  it('returns base counts over the snapshot (suppression is not a user facet)', async () => {
    __setSnapshotForTest(snap());
    const data = await getFacets();
    expect(data.baseCount).toBe(2);
    expect(data).toHaveProperty('trades');
    expect(data).toHaveProperty('regions');
    expect(data).toHaveProperty('segments');
    expect(data).toHaveProperty('flags');
    expect(data).toHaveProperty('suppressedCount');
    expect(data).not.toHaveProperty('suppress');
  });
});

describe('getTagFacets', () => {
  it('returns the tag universe with distinct-customer reach, reach desc', async () => {
    __setSnapshotForTest(snap());
    const tags = await getTagFacets();
    expect(tags).toEqual([
      { value: 'Spring promo', count: 2 },
      { value: 'VIP', count: 1 },
    ]);
  });
});

// --- GET /api/config -----------------------------------------------------
describe('GET /api/config', () => {
  it('returns the backend filter vocabulary', async () => {
    const { GET } = await import('@/app/api/config/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(['flags', 'trades', 'regions', 'segmentGroups']),
    );
    expect(new Set(data.flags.map((f: { f: string }) => f.f))).toEqual(
      new Set(['is_member', 'has_email', 'has_mobile', 'is_repeat_customer']),
    );
    expect(data.trades).toContain('Plumbing');
  });
});

// --- GET /api/facets -----------------------------------------------------
describe('GET /api/facets', () => {
  it('returns base counts', async () => {
    __setSnapshotForTest(snap());
    const { GET } = await import('@/app/api/facets/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.baseCount).toBe(2);
    expect(data).toHaveProperty('trades');
    expect(data).not.toHaveProperty('suppress');
  });

  it('maps an unexpected snapshot error to a generic 500 that does not leak internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Snapshot.prototype, 'baseFacets').mockImplementation(() => {
      throw new Error('secret internal detail');
    });
    __setSnapshotForTest(snap());
    const { GET } = await import('@/app/api/facets/route');
    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).not.toContain('secret internal detail');
    expect(data.error).toContain('server logs');
  });
});

// --- GET /api/tags -------------------------------------------------------
describe('GET /api/tags', () => {
  it('returns { tags } with the tag universe', async () => {
    __setSnapshotForTest(snap());
    const { GET } = await import('@/app/api/tags/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tags).toEqual([
      { value: 'Spring promo', count: 2 },
      { value: 'VIP', count: 1 },
    ]);
  });
});
