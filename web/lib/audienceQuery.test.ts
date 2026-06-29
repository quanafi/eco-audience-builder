/**
 * Tests for the WHERE-clause builders (port of tests/test_audience_query.py).
 *
 * Adapted for `pg` POSITIONAL binds: where the Python suite asserted on named `:p`
 * bind consistency, we assert that the referenced placeholders are exactly $1..$N
 * (N = params.length), each used once. Param *values* are asserted directly.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import * as aq from './audienceQuery';

// Pin the valid-tag vocabulary so tag filtering needs no DB.
beforeEach(() => {
  aq.setTagVocabProvider(() => new Set(['VIP', 'Repair', 'Install']));
});

function placeholderNums(where: string[]): number[] {
  return (where.join('\n').match(/\$(\d+)/g) ?? []).map((s) => Number(s.slice(1)));
}

/** Every placeholder referenced is supplied as $1..$N, each exactly once. */
function assertConsistent(where: string[], params: unknown[]): void {
  const nums = placeholderNums(where);
  expect(nums.length).toBe(params.length); // each param referenced exactly once
  expect([...new Set(nums)].sort((a, b) => a - b)).toEqual(
    params.map((_, i) => i + 1),
  );
}

describe('empty / no-op', () => {
  it('empty payload has no clauses', () => {
    const { where, params } = aq.buildFilters({});
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
  it('empty payload display SQL has no where', () => {
    const sql = aq.buildDisplaySql({});
    expect(sql).not.toContain('\nwhere ');
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });
});

describe('allow-listed column filters (no binds)', () => {
  it('trades or-grouped', () => {
    const { where, params } = aq.buildFilters({ trades: ['Plumbing', 'HVAC'] });
    expect(where).toEqual(['(plumbing_customer = 1 or hvac_customer = 1)']);
    expect(params).toEqual([]);
  });
  it('unknown trade rejected', () => {
    const { where } = aq.buildFilters({ trades: ['Plumbing', 'Telepathy'] });
    expect(where).toEqual(['(plumbing_customer = 1)']);
  });
  it('regions or-grouped', () => {
    const { where } = aq.buildFilters({ regions: ['Columbus', 'Dayton'] });
    expect(where).toEqual(['(is_columbus_customer = 1 or is_dayton_customer = 1)']);
  });
  it('flags use allow-listed expressions', () => {
    const { where } = aq.buildFilters({ flags: ['is_member', 'has_email', 'bogus'] });
    expect(where).toContain('is_member = 1');
    expect(where).toContain("(email is not null and email <> '')");
    expect(where.length).toBe(2);
  });
});

describe('numeric comparisons', () => {
  it('recency min/max bind values', () => {
    const { where, params } = aq.buildFilters({ recencyMin: 30, recencyMax: 365 });
    expect(where.length).toBe(2);
    expect([...params].sort((a, b) => (a as number) - (b as number))).toEqual([30, 365]);
    expect(params.every((v) => Number.isInteger(v))).toBe(true);
    assertConsistent(where, params);
  });
  it('recency inlined as integers', () => {
    const sql = aq.buildDisplaySql({ recencyMin: 30, recencyMax: 365 });
    expect(sql).toContain('days_since_last_job >= 30');
    expect(sql).toContain('days_since_last_job <= 365');
  });
  it('spend bind values are numeric', () => {
    const { where, params } = aq.buildFilters({ spendMin: 1000, spendMax: 5000 });
    expect([...params].sort((a, b) => (a as number) - (b as number))).toEqual([1000, 5000]);
    assertConsistent(where, params);
  });
  it('spend inlined as numbers', () => {
    const sql = aq.buildDisplaySql({ spendMin: 1000, spendMax: 5000 });
    expect(sql).toContain('lifetime_revenue >= 1000');
    expect(sql).toContain('lifetime_revenue <= 5000');
  });
  it('blank numeric filters are ignored', () => {
    const { where, params } = aq.buildFilters({ recencyMin: '', spendMax: null });
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
  it('non-scalar numeric inputs are rejected (no spurious clause)', () => {
    // Number([]) is 0 in JS; a malformed array/object payload must NOT add a `>= 0`
    // clause (Python's float([]) raises → None).
    const { where, params } = aq.buildFilters({
      spendMin: [] as unknown as number,
      recencyMin: {} as unknown as number,
    });
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
  it('large spend renders as a plain decimal in display SQL (no scientific notation)', () => {
    const sql = aq.buildDisplaySql({ spendMin: 1_000_000 });
    expect(sql).toContain('lifetime_revenue >= 1000000');
  });
});

describe('list membership: zips', () => {
  it('keeps only valid five-digit zips', () => {
    const { where, params } = aq.buildFilters({ zips: '43215, 9999, 12345 abc' });
    expect(where.length).toBe(1);
    expect(params).toEqual([['43215', '12345']]);
    assertConsistent(where, params);
  });
  it('zip membership inlined', () => {
    const sql = aq.buildDisplaySql({ zips: ['43215', '43210'] });
    expect(sql).toContain("'43215'");
    expect(sql).toContain("'43210'");
    expect(sql).toContain(aq.ZIP_EXPR);
  });
  it('all-invalid zips produce no clause', () => {
    const { where, params } = aq.buildFilters({ zips: 'abcde, 123' });
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
});

describe('list membership: segments', () => {
  it('segment membership bound as strings', () => {
    const { where, params } = aq.buildFilters({ revenueSegments: ['High', 'Mid'] });
    expect(where.length).toBe(1);
    expect(where[0]).toContain('lifetime_revenue_segment');
    expect(params).toEqual([['High', 'Mid']]);
    assertConsistent(where, params);
  });
  it('segment value with a quote is escaped in display SQL', () => {
    const sql = aq.buildDisplaySql({ revenueSegments: ["O'Brien"] });
    expect(sql).toContain("'O''Brien'");
  });
});

describe('list membership: tags (validated against vocabulary)', () => {
  it('tags validated against vocabulary', () => {
    const { where, params } = aq.buildFilters({ tags: ['VIP', 'NotARealTag'] });
    expect(where.length).toBe(1);
    expect(where[0]).toContain('exists (select 1 from');
    expect(where[0]).toContain(aq.JOBS_TABLE);
    expect(params).toEqual([['VIP']]);
    assertConsistent(where, params);
  });
  it('tags inlined inside exists subquery', () => {
    const sql = aq.buildDisplaySql({ tags: ['VIP', 'Repair'] });
    expect(sql).toContain('exists (select 1 from');
    expect(sql).toContain("'VIP'");
    expect(sql).toContain("'Repair'");
  });
});

describe('exclude set', () => {
  it('exclude clauses are negated', () => {
    const { where } = aq.buildFilters({
      trades: ['Plumbing'],
      exclude: { regions: ['Columbus'] },
    });
    expect(where).toContain('(plumbing_customer = 1)');
    expect(where).toContain('not ((is_columbus_customer = 1))');
  });
  it('exclude binds do not collide with include', () => {
    const { where, params } = aq.buildFilters({
      recencyMin: 30,
      exclude: { recencyMin: 90 },
    });
    const nums = placeholderNums(where);
    expect(nums.length).toBe(2);
    expect(new Set(nums).size).toBe(2);
    expect([...params].sort((a, b) => (a as number) - (b as number))).toEqual([30, 90]);
    assertConsistent(where, params);
  });
  it('exclude negated in display SQL', () => {
    const sql = aq.buildDisplaySql({ exclude: { trades: ['HVAC'] } });
    expect(sql).toContain('not ((hvac_customer = 1))');
  });
});

describe('do-not-contact suppression (always-on, gated on available columns)', () => {
  it('emits all available channels regardless of payload', () => {
    const { where, params } = aq.buildFilters({}, new Set(['do_not_mail', 'do_not_text']));
    expect(where).toContain('not (do_not_mail is true)');
    expect(where).toContain(
      "not ((do_not_text_numbers is not null and do_not_text_numbers <> ''))",
    );
    expect(params).toEqual([]);
  });
  it('keeps canonical SUPPRESS order', () => {
    const { where } = aq.buildFilters({}, new Set(['do_not_service', 'do_not_mail']));
    expect(where).toEqual([
      'not (do_not_mail is true)',
      'not (do_not_service is true)',
    ]);
  });
  it('no available channels → no clause', () => {
    const { where, params } = aq.buildFilters({});
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
  it('empty available → no clause', () => {
    const { where, params } = aq.buildFilters({}, new Set<string>());
    expect(where).toEqual([]);
    expect(params).toEqual([]);
  });
  it('rendered in display SQL', () => {
    const sql = aq.buildDisplaySql({}, new Set(['do_not_service']));
    expect(sql).toContain('not (do_not_service is true)');
  });
});

describe('combined include + exclude', () => {
  it('kitchen-sink payload stays internally consistent', () => {
    const payload = {
      trades: ['Plumbing'],
      regions: ['Columbus', 'Dayton'],
      recencyMin: 30,
      spendMax: 5000,
      zips: ['43215'],
      revenueSegments: ['High'],
      flags: ['is_member'],
      tags: ['VIP'],
      exclude: { recencyMax: 10, tags: ['Repair'] },
    };
    const { where, params } = aq.buildFilters(payload);
    assertConsistent(where, params);
    const sql = aq.buildDisplaySql(payload);
    expect(sql).toContain('plumbing_customer = 1');
    expect(sql).toContain('not (');
  });
});
