/**
 * Anti-drift parity tests (port of tests/test_parity.py): the SQL builder
 * (audienceQuery) and the in-memory matcher (snapshot) encode the same filter semantics
 * by hand, so they must agree. For one dataset and a battery of payloads we assert
 * (a) snapshot.matchMask returns the hand-computed IDs, (b) buildDisplaySql emits the
 * corresponding clause, and (c) buildFilters' positional placeholders are consistent.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import * as aq from './audienceQuery';
import { Snapshot } from './snapshot';
import type { FilterPayload, Row } from './types';

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
  const tags: Row[] = [
    { customer_id: 1, tag: 'VIP' },
    { customer_id: 2, tag: 'Repair' },
    { customer_id: 4, tag: 'VIP' },
    { customer_id: 4, tag: 'Install' },
  ];
  return Snapshot.fromRows(rows, tags);
}

function ids(s: Snapshot, payload: FilterPayload): number[] {
  const mask = s.matchMask(payload);
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) if (mask[i]) out.push(s.customerId[i]);
  return out.sort((a, b) => a - b);
}

// Pin the valid-tag vocabulary (Python stubs _valid_tags).
beforeEach(() => {
  aq.setTagVocabProvider(() => new Set(['VIP', 'Repair', 'Install']));
});

interface Case {
  name: string;
  payload: FilterPayload;
  expected: number[];
  sql: string[];
}
const CASES: Case[] = [
  { name: 'trades_single', payload: { trades: ['Plumbing'] }, expected: [1, 4], sql: ['plumbing_customer = 1'] },
  { name: 'trades_or', payload: { trades: ['Plumbing', 'HVAC'] }, expected: [1, 2, 4], sql: ['plumbing_customer = 1 or hvac_customer = 1'] },
  { name: 'regions', payload: { regions: ['Columbus'] }, expected: [1, 4], sql: ['is_columbus_customer = 1'] },
  { name: 'recency_max', payload: { recencyMax: 50 }, expected: [1, 4], sql: ['days_since_last_job <= 50'] },
  { name: 'recency_min', payload: { recencyMin: 50 }, expected: [2], sql: ['days_since_last_job >= 50'] },
  { name: 'spend_min', payload: { spendMin: 2000 }, expected: [2, 4], sql: ['lifetime_revenue >= 2000'] },
  { name: 'spend_max', payload: { spendMax: 2000 }, expected: [1], sql: ['lifetime_revenue <= 2000'] },
  { name: 'zips', payload: { zips: '43215' }, expected: [1, 4], sql: ["'43215'"] },
  { name: 'segments', payload: { revenueSegments: ['High'] }, expected: [1, 4], sql: ["lifetime_revenue_segment in ('High')"] },
  { name: 'flag_email', payload: { flags: ['has_email'] }, expected: [1, 4], sql: ["(email is not null and email <> '')"] },
  { name: 'flag_member', payload: { flags: ['is_member'] }, expected: [1, 4], sql: ['is_member = 1'] },
  { name: 'tags', payload: { tags: ['VIP'] }, expected: [1, 4], sql: ['exists', "'VIP'"] },
  { name: 'exclude_trade', payload: { exclude: { trades: ['HVAC'] } }, expected: [1, 3], sql: ['not ((hvac_customer = 1))'] },
  { name: 'include_and_exclude', payload: { trades: ['Plumbing'], exclude: { tags: ['VIP'] } }, expected: [], sql: ['plumbing_customer = 1'] },
];

describe('snapshot.matchMask returns the expected ids', () => {
  it.each(CASES)('$name', ({ payload, expected }) => {
    expect(ids(snap(), payload)).toEqual(expected);
  });
});

describe('buildDisplaySql emits the corresponding clause', () => {
  it.each(CASES)('$name', ({ payload, sql }) => {
    const out = aq.buildDisplaySql(payload).toLowerCase();
    for (const sub of sql) expect(out).toContain(sub.toLowerCase());
  });
});

describe('buildFilters positional placeholders are consistent', () => {
  it.each(CASES)('$name', ({ payload }) => {
    const { where, params } = aq.buildFilters(payload);
    const nums = (where.join('\n').match(/\$(\d+)/g) ?? []).map((s) => Number(s.slice(1)));
    expect(nums.length).toBe(params.length);
    expect([...new Set(nums)].sort((a, b) => a - b)).toEqual(params.map((_, i) => i + 1));
  });
});

it('suppression excludes opted-out customers in both paths', () => {
  const s = Snapshot.fromRows([row(1), row(2, { do_not_mail: true })]);
  expect(ids(s, {})).toEqual([1]);
  const sql = aq.buildDisplaySql({}, new Set(['do_not_mail']));
  expect(sql).toContain('not (do_not_mail is true)');
});
