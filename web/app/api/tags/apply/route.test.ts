/**
 * Tests for the tag-apply lib + route (port of the tag-apply cases in
 * tests/test_endpoints.py): empty tag -> 400, a valid tag resolves the full matched
 * id list from an injected snapshot and returns the summary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyTag } from '@/lib/servicetitan';
import { Snapshot } from '@/lib/snapshot';
import { __setSnapshotForTest } from '@/lib/snapshotStore';
import type { Row } from '@/lib/types';
import { POST } from './route';

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

function fromRows(rows: Row[]): Snapshot {
  return Snapshot.fromRows(rows);
}

function post(body: unknown): Request {
  return new Request('http://test/api/tags/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('applyTag (mock ServiceTitan client)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('builds the payload, logs it, and returns a summary', () => {
    const result = applyTag('  Spring promo  ', [3, 1, 2]);
    expect(result).toEqual({ ok: true, tag: 'Spring promo', wouldTag: 3 });

    expect(logSpy).toHaveBeenCalledOnce();
    const logged = String(logSpy.mock.calls[0][0]);
    expect(logged).toContain('[servicetitan MOCK]');
    const json = JSON.parse(logged.slice(logged.indexOf('{')));
    expect(json.tag).toBe('Spring promo');
    expect(json.count).toBe(3);
    expect(json.customerIds).toEqual([3, 1, 2]);
    expect(json.endpoint).toContain('servicetitan.io');
  });

  it('truncates the logged id list for big audiences (full count preserved)', () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    const result = applyTag('Big', ids);
    expect(result.wouldTag).toBe(25);
    const logged = String(logSpy.mock.calls[0][0]);
    const json = JSON.parse(logged.slice(logged.indexOf('{')));
    expect(json.count).toBe(25);
    expect(json.customerIds).toHaveLength(21); // 20 ids + the "...(+5 more)" marker
    expect(json.customerIds[20]).toBe('...(+5 more)');
  });
});

describe('POST /api/tags/apply', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    __setSnapshotForTest(null);
  });

  it('rejects a missing tag with 400', async () => {
    __setSnapshotForTest(fromRows([row(1, { plumbing_customer: 1 })]));
    const res = await POST(post({ filters: {} }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A tag name is required.' });
  });

  it('rejects a whitespace-only tag with 400', async () => {
    __setSnapshotForTest(fromRows([row(1, { plumbing_customer: 1 })]));
    const res = await POST(post({ filters: {}, tag: '   ' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'A tag name is required.' });
  });

  it('resolves the full matched id list and returns the summary', async () => {
    __setSnapshotForTest(
      fromRows([
        row(1, { plumbing_customer: 1 }),
        row(2, { hvac_customer: 1 }),
        row(3, { plumbing_customer: 1 }),
      ]),
    );
    const res = await POST(post({ filters: { trades: ['Plumbing'] }, tag: 'Spring promo' }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2); // customers 1 and 3
    expect(body.message).toContain("Spring promo");
    expect(body.message).toContain('2 customers');

    // The mock logged the full matched audience.
    const logged = String(logSpy.mock.calls[0][0]);
    const json = JSON.parse(logged.slice(logged.indexOf('{')));
    expect(json.customerIds).toEqual([1, 3]);
  });

  it('400s when no customers match the filters', async () => {
    __setSnapshotForTest(fromRows([row(1, { plumbing_customer: 1 })]));
    const res = await POST(post({ filters: { trades: ['HVAC'] }, tag: 'Spring promo' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No customers match these filters.' });
  });
});
