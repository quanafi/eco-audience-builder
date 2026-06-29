/**
 * Smoke tests for the /api/ads/* route handlers. Port of tests/test_ads_endpoints.py.
 *
 * The DB and snapshot are mocked so these need no warehouse and make no network call
 * (dry-run is the default). `streamQuery` yields a small, fixed audience with mixed
 * identifier coverage; `getSnapshot` returns a stub with an availableSuppress set. They
 * assert the wiring: estimate returns coverage + per-platform predicted ranges; send
 * returns a dry-run stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A small, fixed audience with mixed identifier coverage (mirrors the Python fixture).
let rows: Record<string, unknown>[] = [
  { customer_id: 1, email: 'a@x.com', phone_number: '(614) 555-0001', name: 'Ann Lee', zip: '43215' },
  { customer_id: 2, email: 'b@x.com', phone_number: '', name: '', zip: '' },
  { customer_id: 3, email: '', phone_number: '6145550003', name: 'Cy Poe', zip: '43220' },
];

vi.mock('@/lib/db', () => ({
  // eslint-disable-next-line require-yield
  async *streamQuery() {
    for (const r of rows) yield r;
  },
}));

vi.mock('@/lib/snapshotStore', () => ({
  getSnapshot: async () => ({ availableSuppress: new Set<string>() }),
}));

import { POST as estimatePost } from './estimate/route';
import { POST as sendPost } from './send/route';

/** Build a minimal NextRequest-like object with a json() body. */
function makeReq(body: unknown): Request {
  return new Request('http://test/api/ads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rows = [
    { customer_id: 1, email: 'a@x.com', phone_number: '(614) 555-0001', name: 'Ann Lee', zip: '43215' },
    { customer_id: 2, email: 'b@x.com', phone_number: '', name: '', zip: '' },
    { customer_id: 3, email: '', phone_number: '6145550003', name: 'Cy Poe', zip: '43220' },
  ];
});

describe('POST /api/ads/estimate', () => {
  it('returns coverage and per-platform ranges', async () => {
    const res = await estimatePost(makeReq({ filters: {}, platforms: ['google', 'meta'] }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.audienceCount).toBe(3);
    expect(data.coverage.hasEmail).toBe(2);
    for (const p of ['google', 'meta']) {
      const est = data.platforms[p];
      for (const k of ['lowPct', 'highPct', 'lowCount', 'highCount', 'basis', 'disclaimer']) {
        expect(est).toHaveProperty(k);
      }
      expect(est.disclaimer).toContain('NOT a');
    }
  });
});

describe('POST /api/ads/send', () => {
  it('is a dry run', async () => {
    const res = await sendPost(makeReq({ filters: {}, platform: 'google' }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.dryRun).toBe(true);
    expect(data.count).toBe(3);
    expect(data.message).toContain('Dry run');
  });

  it('rejects unknown platform', async () => {
    const res = await sendPost(makeReq({ filters: {}, platform: 'tiktok' }) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('empty audience is 400', async () => {
    rows = [];
    const res = await sendPost(makeReq({ filters: {}, platform: 'meta' }) as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('No customers');
  });
});
