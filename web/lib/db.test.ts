/**
 * Tests for the read-only guard (port of tests/test_db.py).
 * Pure — no pool/DB needed. The guard permits exactly one SELECT/WITH statement and
 * rejects writes, multi-statement payloads, and statements smuggled past a comment.
 */
import { describe, it, expect } from 'vitest';
import { assertReadOnly, stripComments } from './db';
import { ValidationError } from './errors';

const ok = (sql: string) => expect(() => assertReadOnly(sql)).not.toThrow();
const bad = (sql: string) => expect(() => assertReadOnly(sql)).toThrow(ValidationError);

describe('assertReadOnly — accepted', () => {
  it('plain select', () => ok('select 1'));
  it('with cte', () => ok('with x as (select 1) select * from x'));
  it('case insensitive', () => {
    ok('SELECT 1');
    ok('SeLeCt 1');
    ok('WITH x AS (select 1) SELECT * FROM x');
  });
  it('leading whitespace and blank lines', () => ok('\n\n   select 1'));
  it('leading line comment', () =>
    ok('-- header comment\nselect customer_id from edw2.customers'));
  it('block comment prefix', () => ok('/* a banner */ select 1'));
  it('comment mentioning a write keyword is fine', () =>
    ok('/* this does not delete anything */ select 1'));
  it('single trailing semicolon allowed', () => {
    ok('select 1;');
    ok('select 1 ;\n');
  });
});

describe('assertReadOnly — rejected', () => {
  it.each([
    'insert into t values (1)',
    'update t set x = 1',
    'delete from t',
    'drop table t',
    'truncate t',
    '',
    '   \n  ',
  ])('rejects non-select: %j', (sql) => bad(sql));

  it('rejects multi-statement', () => bad('select 1; delete from t'));
  it('rejects write after select with trailing semicolons', () =>
    bad('select * from edw2.customers; drop table edw2.customers;'));
  it('rejects write hidden after block comment', () => bad('/* select */ delete from t'));
  it('rejects statement hidden after line comment', () =>
    bad('select 1 -- ignore\n; delete from t'));
});

describe('stripComments', () => {
  it('removes block and line comments', () => {
    expect(stripComments('select 1 /* secret */ -- secret\nfrom t')).not.toContain('secret');
  });
});
