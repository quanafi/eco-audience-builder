/**
 * Tests for runAudience + the POST /api/audience route (port of the audience slice of
 * tests/test_endpoints.py).
 *
 * The DB seams are mocked: `./db`'s runQuery is a vi.fn (the only warehouse round-trip is
 * the preview-row fetch), and the snapshot is injected via __setSnapshotForTest with a
 * Snapshot.fromRows fixture (mirrors monkeypatching get_snapshot). We assert the stats /
 * sql / preview shape and the 400/500 error mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the DB layer before importing anything that uses it. runQuery returns the preview
// rows for the requested ids; the snapshot is injected (so its own queries never run).
const runQuery = vi.fn();
vi.mock('./db', () => ({
  runQuery: (sql: string, params: unknown[]) => runQuery(sql, params),
}));

import { runAudience, fetchPreviewRows } from './audience';
import { POST } from '@/app/api/audience/route';
import { Snapshot } from './snapshot';
import { __setSnapshotForTest } from './snapshotStore';
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

function makeSnapshot(): Snapshot {
  return Snapshot.fromRows([
    row(1, { plumbing_customer: 1, has_email: true, lifetime_revenue: 1000, days_since_last_job: 10 }),
    row(2, { hvac_customer: 1, has_mobile: true, lifetime_revenue: 5000, days_since_last_job: 50 }),
  ]);
}

/** A preview detail row as the warehouse SELECT would return it (pre-presentRow). */
const previewRow = (cid: number, over: Row = {}): Row => ({
  customer_id: cid,
  name: `Cust ${cid}`,
  city: 'Columbus',
  zip: '43215',
  state: 'OH',
  primary_trade: 'Plumbing',
  lifetime_jobs: 3,
  lifetime_revenue: 1000,
  last_completed_job: null,
  days_since_last_job: 10,
  lifetime_revenue_segment: 'High',
  is_member: false,
  has_email: true,
  has_mobile: false,
  is_repeat_customer: false,
  ...over,
});

beforeEach(() => {
  runQuery.mockReset();
  __setSnapshotForTest(makeSnapshot());
});
afterEach(() => {
  __setSnapshotForTest(null);
});

describe('fetchPreviewRows', () => {
  it('no ids → no DB call, empty result', async () => {
    const rows = await fetchPreviewRows([]);
    expect(rows).toEqual([]);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('binds the id array positionally as $1 and returns rows in id order', async () => {
    // Return out of order to prove the caller re-orders by the requested ids.
    runQuery.mockResolvedValue([previewRow(2), previewRow(1)]);
    const rows = await fetchPreviewRows([1, 2]);
    expect(rows.map((r) => r.customer_id)).toEqual([1, 2]);
    const [sql, params] = runQuery.mock.calls[0];
    expect(sql).toContain('customer_id = any($1)');
    expect(params).toEqual([[1, 2]]); // the array is the single positional bind
  });

  it('drops ids the warehouse did not return', async () => {
    runQuery.mockResolvedValue([previewRow(1)]);
    const rows = await fetchPreviewRows([1, 2]);
    expect(rows.map((r) => r.customer_id)).toEqual([1]);
  });

  it('maps each row through presentRow', async () => {
    runQuery.mockResolvedValue([previewRow(1, { name: '  ', primary_trade: null })]);
    const [r] = await fetchPreviewRows([1]);
    expect(r.name).toBe('Customer #1'); // blank name defaulted
    expect(r.primary_trade).toBe('—'); // null trade defaulted
    expect(r.has_email).toBe(true);
  });
});

describe('runAudience', () => {
  it('returns counts, base, sql and preview rows', async () => {
    runQuery.mockResolvedValue([previewRow(1)]);
    const data = await runAudience({ trades: ['Plumbing'] });
    expect(data.audienceCount).toBe(1); // only customer 1 is Plumbing
    expect(data.baseCount).toBe(2);
    expect(data.pctBase).toBeCloseTo(50);
    expect(data.sql.toLowerCase()).toContain('select');
    expect(data.rows.map((r) => r.customer_id)).toEqual([1]);
    expect(data.limited).toBe(false);
    expect(data.facetCounts).toBeTruthy();
  });

  it('empty payload matches everyone (reach from email/mobile)', async () => {
    runQuery.mockResolvedValue([previewRow(1), previewRow(2)]);
    const data = await runAudience({});
    expect(data.audienceCount).toBe(2);
    expect(data.reachCount).toBe(2); // 1 has email, 2 has mobile
    expect(data.totalValue).toBe(6000);
    expect(data.avgValue).toBe(3000);
  });

  it('no matches → no preview fetch and pctBase 0', async () => {
    const data = await runAudience({ trades: ['Electric'] });
    expect(data.audienceCount).toBe(0);
    expect(data.rows).toEqual([]);
    expect(data.pctBase).toBe(0);
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('suppression clauses are gated to available columns in the display SQL', async () => {
    runQuery.mockResolvedValue([]);
    const data = await runAudience({});
    // fromRows exposes all three SUPPRESS keys as available.
    expect(data.sql).toContain('not (do_not_mail is true)');
  });
});

describe('POST /api/audience route', () => {
  function req(body: unknown): Request {
    return new Request('http://localhost/api/audience', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 200 with the audience response', async () => {
    runQuery.mockResolvedValue([previewRow(1)]);
    const res = await POST(req({ trades: ['Plumbing'] }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.audienceCount).toBe(1);
    expect(data.baseCount).toBe(2);
    expect(data.sql.toLowerCase()).toContain('select');
  });

  it('a malformed JSON body falls back to {} (matches everyone)', async () => {
    runQuery.mockResolvedValue([previewRow(1), previewRow(2)]);
    const bad = new Request('http://localhost/api/audience', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(bad as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.audienceCount).toBe(2);
  });

  it('an unhandled error returns a generic 500 that does not leak internals', async () => {
    runQuery.mockRejectedValue(new Error('secret internal detail'));
    const res = await POST(req({ trades: ['Plumbing'] }) as never);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).not.toContain('secret internal detail');
    expect(data.error).toContain('server logs');
  });
});
