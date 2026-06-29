/**
 * Full-audience export to CSV / Excel (.xlsx). Port of app/export.py.
 *
 * Reuses the include+exclude+suppression WHERE builder via buildColumnQuery (in
 * customerColumns.ts) — it selects only the requested columns with no row limit, so the
 * export is the *whole* matching audience (tens of thousands of rows — hence streaming).
 *
 * The customer_id column is rendered as a clickable link to the customer's ServiceTitan
 * profile: a =HYPERLINK() formula in CSV, a native cell hyperlink in xlsx.
 */
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import {
  COLUMN_CATALOG,
  buildColumnQuery,
  resolveColumns,
  type ColumnKind,
} from './customerColumns';
import { streamQuery } from './db';
import { getSnapshot } from './snapshotStore';
import type { FilterPayload, Row } from './types';

// Base URL for a customer's ServiceTitan profile. {id} is the customer_id.
export const ST_CUSTOMER_URL =
  process.env.ST_CUSTOMER_URL ?? 'https://go.servicetitan.com/#/customer/{id}';

/** Render the ServiceTitan profile URL for a customer id. */
export function stUrl(customerId: unknown): string {
  return ST_CUSTOMER_URL.replace('{id}', String(customerId));
}

// A text cell starting with one of these is interpreted as a formula by Excel/Google
// Sheets — e.g. a customer name of "=cmd|..." or "+HYPERLINK(...)" would execute on open.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralize spreadsheet formula injection by prefixing a risky leading character with a
 * single quote. Non-string values (numbers, "Yes"/"No", null) pass through unchanged.
 */
export function csvSafe<T>(value: T): T | string {
  if (typeof value === 'string' && FORMULA_PREFIXES.some((p) => value.startsWith(p))) {
    return "'" + value;
  }
  return value;
}

/** Coerce a raw DB value to a clean cell value (native types where it helps). */
export function formatCell(kind: ColumnKind, value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (kind === 'bool') return value ? 'Yes' : 'No';
  if (kind === 'money') return Math.round(Number(value) * 100) / 100;
  if (kind === 'int') return Math.trunc(Number(value));
  if (kind === 'date') {
    if (value instanceof Date) {
      // Format from local components (pg builds a `date` Date at local midnight) so the
      // ISO date can't drift a day under toISOString's UTC conversion.
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  }
  return String(value);
}

/**
 * Build the (sql, params) for the export, gating do-not-contact suppression on the
 * columns the live mart actually has — using the same in-memory snapshot the rest of the
 * app reads (mirrors app/export._build_query).
 */
export async function buildExportQuery(
  columns: string[],
  filters: FilterPayload,
): Promise<{ sql: string; params: unknown[] }> {
  const snapshot = await getSnapshot();
  return buildColumnQuery(columns, filters ?? {}, snapshot.availableSuppress);
}

/** RFC-4180 CSV field quoting (matches Python's csv.writer default dialect). */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(values: (string | number)[]): string {
  return values.map(csvField).join(',') + '\r\n';
}

/**
 * Yield a CSV a chunk (row) at a time. customer_id is a =HYPERLINK formula; every other
 * cell is run through the formula-injection guard.
 */
export async function* streamCsv(
  columns: string[] | undefined,
  filters: FilterPayload,
): AsyncGenerator<string, void, unknown> {
  const cols = resolveColumns(columns);
  const { sql, params } = await buildExportQuery(cols, filters);

  yield csvRow(cols.map((c) => COLUMN_CATALOG[c].header));

  for await (const row of streamQuery(sql, params)) {
    const out: (string | number)[] = [];
    for (const c of cols) {
      const v = (row as Row)[c];
      if (c === 'customer_id' && v !== null && v !== undefined) {
        out.push(`=HYPERLINK("${stUrl(v)}","${v}")`);
      } else {
        out.push(csvSafe(formatCell(COLUMN_CATALOG[c].kind, v)));
      }
    }
    yield csvRow(out);
  }
}

/**
 * Build an .xlsx workbook as a Buffer, with customer_id as a native cell hyperlink.
 *
 * Uses exceljs streaming WorkbookWriter so worksheet rows stream to the output stream
 * rather than all living in memory as a fully-built workbook (analogue of openpyxl
 * write_only mode).
 */
export async function buildXlsx(
  columns: string[] | undefined,
  filters: FilterPayload,
): Promise<Buffer> {
  const cols = resolveColumns(columns);
  const { sql, params } = await buildExportQuery(cols, filters);

  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  const collected = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const ws = workbook.addWorksheet('Audience');
  const linkFont = { color: { argb: 'FF0563C1' }, underline: true } as const;

  ws.addRow(cols.map((c) => COLUMN_CATALOG[c].header)).commit();

  for await (const row of streamQuery(sql, params)) {
    const cells: (string | number)[] = [];
    for (const c of cols) {
      const v = (row as Row)[c];
      if (c === 'customer_id' && v !== null && v !== undefined) {
        cells.push(''); // placeholder; set the hyperlink cell value below
      } else {
        cells.push(csvSafe(formatCell(COLUMN_CATALOG[c].kind, v)));
      }
    }
    const added = ws.addRow(cells);
    const cidIdx = cols.indexOf('customer_id');
    if (cidIdx !== -1) {
      const v = (row as Row).customer_id;
      if (v !== null && v !== undefined) {
        const cell = added.getCell(cidIdx + 1);
        cell.value = { text: String(v), hyperlink: stUrl(v) };
        cell.font = { ...linkFont };
      }
    }
    added.commit();
  }

  await workbook.commit();
  return collected;
}
