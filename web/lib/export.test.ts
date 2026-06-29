/**
 * Tests for lib/export: column resolution, value formatting, CSV formula-injection
 * neutralization, the streaming CSV shape, and suppression gating. No DB — streamQuery
 * and the snapshot's availableSuppress are mocked (port of tests/test_export.py).
 */
import { afterEach, describe, it, expect, vi } from 'vitest';

// --- mocks ---------------------------------------------------------------
// streamQuery is replaced per-test via the spy below. assertReadOnly is a no-op here.
const streamRows = { rows: [] as Record<string, unknown>[] };
vi.mock('./db', () => ({
  // eslint-disable-next-line require-yield
  streamQuery: vi.fn(async function* () {
    for (const r of streamRows.rows) yield r;
  }),
}));

// getSnapshot returns a fake snapshot exposing availableSuppress.
const snap = { availableSuppress: new Set<string>() };
vi.mock('./snapshotStore', () => ({
  getSnapshot: vi.fn(async () => snap),
}));

import * as exportLib from './export';
import { resolveColumns, DEFAULT_COLUMNS } from './customerColumns';

afterEach(() => {
  streamRows.rows = [];
  snap.availableSuppress = new Set<string>();
});

/** Minimal CSV parser for the small, well-formed output we produce. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // swallow; \r\n handled by the \n branch
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

// --- resolveColumns ------------------------------------------------------
describe('resolveColumns', () => {
  it('drops unknown, keeps known', () => {
    expect(resolveColumns(['name', 'totally_bogus'])).toEqual(['name']);
  });
  it('orders by catalog, not request', () => {
    expect(resolveColumns(['zip', 'customer_id', 'name'])).toEqual([
      'customer_id',
      'name',
      'zip',
    ]);
  });
  it('empty falls back to default', () => {
    expect(resolveColumns([])).toEqual(DEFAULT_COLUMNS);
  });
  it('all-unknown falls back to default', () => {
    expect(resolveColumns(['nope', 'nada'])).toEqual(DEFAULT_COLUMNS);
  });
});

// --- formatCell ----------------------------------------------------------
describe('formatCell', () => {
  it('none is empty string', () => {
    expect(exportLib.formatCell('str', null)).toBe('');
    expect(exportLib.formatCell('str', undefined)).toBe('');
  });
  it('bool', () => {
    expect(exportLib.formatCell('bool', true)).toBe('Yes');
    expect(exportLib.formatCell('bool', false)).toBe('No');
  });
  it('money rounds', () => {
    expect(exportLib.formatCell('money', 1000)).toBe(1000.0);
    expect(exportLib.formatCell('money', 1.005)).toBe(1.0); // float rounding parity
  });
  it('int coerces', () => {
    expect(exportLib.formatCell('int', 3.0)).toBe(3);
    expect(exportLib.formatCell('int', 3.9)).toBe(3);
  });
  it('date iso (Date)', () => {
    expect(exportLib.formatCell('date', new Date(2026, 5, 26))).toBe('2026-06-26');
  });
  it('date iso (string)', () => {
    expect(exportLib.formatCell('date', '2026-06-26T00:00:00')).toBe('2026-06-26');
  });
});

// --- csvSafe (formula-injection neutralization) --------------------------
describe('csvSafe', () => {
  it.each(['=cmd|x', '+1+1', '-2', '@SUM(A1)', '\ttab', '\rcr'])(
    'prefixes formula trigger %j',
    (bad) => {
      expect(exportLib.csvSafe(bad)).toBe("'" + bad);
    },
  );
  it('passes plain text', () => {
    expect(exportLib.csvSafe('Acme Plumbing')).toBe('Acme Plumbing');
  });
  it('passes non-strings', () => {
    expect(exportLib.csvSafe(123)).toBe(123);
    expect(exportLib.csvSafe(null)).toBe(null);
  });
});

// --- stUrl ---------------------------------------------------------------
describe('stUrl', () => {
  it('substitutes the id', () => {
    expect(exportLib.stUrl(7)).toContain('/customer/7');
  });
});

// --- streamCsv -----------------------------------------------------------
describe('streamCsv', () => {
  it('header, hyperlink, and neutralized name', async () => {
    streamRows.rows = [{ customer_id: 7, name: '=Evil()', email: 'a@b.com' }];

    const out = await collect(
      exportLib.streamCsv(['customer_id', 'name', 'email'], {}),
    );
    const parsed = parseCsv(out);

    expect(parsed[0]).toEqual(['Customer ID', 'Name', 'Email']);
    expect(parsed[1][0].startsWith('=HYPERLINK(')).toBe(true); // customer_id stays a link formula
    expect(parsed[1][0]).toContain('/customer/7');
    expect(parsed[1][1]).toBe("'=Evil()"); // untrusted name neutralized
    expect(parsed[1][2]).toBe('a@b.com');
  });
});

// --- buildExportQuery (suppression gating) -------------------------------
describe('buildExportQuery', () => {
  it('gates on availableSuppress', async () => {
    snap.availableSuppress = new Set(['do_not_mail']);
    const { sql } = await exportLib.buildExportQuery(['customer_id'], {});
    expect(sql).toContain('from edw2.customers');
    expect(sql).toContain('do_not_mail'); // suppression gated in because column is available
    expect(sql).toContain('order by customer_id asc');
  });

  it('omits suppression when no columns available', async () => {
    snap.availableSuppress = new Set();
    const { sql } = await exportLib.buildExportQuery(['customer_id'], {});
    expect(sql).not.toContain('do_not_mail');
  });
});

// --- buildXlsx -----------------------------------------------------------
describe('buildXlsx', () => {
  it('produces a non-empty xlsx buffer (zip magic)', async () => {
    streamRows.rows = [{ customer_id: 7, name: 'Acme' }];
    const buf = await exportLib.buildXlsx(['customer_id', 'name'], {});
    expect(buf.length).toBeGreaterThan(0);
    // .xlsx is a zip archive — first two bytes are "PK".
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
