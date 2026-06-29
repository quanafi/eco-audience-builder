/**
 * Read-only Cloud SQL (Postgres) access for the Audience Builder.
 *
 * Port of app/db.py: a thin wrapper around a pooled `pg` client that refuses anything
 * that is not a single SELECT/WITH statement.
 *
 * Connection:
 *   - Cloud SQL unix socket — set INSTANCE_CONNECTION_NAME (project:region:instance);
 *     we connect via host=/cloudsql/<conn> and read PGUSER/PGPASSWORD/PGDATABASE from
 *     the environment (pg's standard vars).
 *   - TCP — otherwise connect from DATABASE_URL (a socket-style URL with ?host=/cloudsql
 *     also works, since pg parses the host query param).
 *
 * Parameters are POSITIONAL ($1, $2, …) with a values array — unlike SQLAlchemy's
 * named binds. `= any($n)` accepts a JS array directly.
 */
import { Pool, type PoolClient } from 'pg';
import Cursor from 'pg-cursor';
import { ValidationError } from './errors';
import type { Row } from './types';

// /* ... */ block comments (dotall via [\s\S] so they can span lines).
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

let _pool: Pool | null = null;

/** Lazily create the connection pool (analogue of db.py get_engine + lru_cache). */
export function getPool(): Pool {
  if (_pool) return _pool;

  const conn = process.env.INSTANCE_CONNECTION_NAME;
  const url = process.env.DATABASE_URL;

  if (conn) {
    // Cloud SQL unix socket. pg treats a host starting with "/" as a socket directory
    // and appends /.s.PGSQL.5432. User/password/database come from PG* env vars.
    _pool = new Pool({
      host: `/cloudsql/${conn}`,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 10,
    });
  } else if (url) {
    _pool = new Pool({ connectionString: url, max: 10 });
  } else {
    throw new Error('DATABASE_URL is not set. Copy it into .env.local.');
  }
  return _pool;
}

/**
 * Remove /* *​/ block comments and -- line comments.
 *
 * Our executed queries never contain `--` or `/* *​/` inside string literals, so
 * stripping `--` to end-of-line is safe here and prevents a comment from hiding a
 * second statement.
 */
export function stripComments(sql: string): string {
  const noBlock = sql.replace(BLOCK_COMMENT, ' ');
  // Split on CR, LF, and CRLF (mirrors Python str.splitlines), so a `--` comment over
  // bare-CR line endings can't hide a second statement past the end-of-line strip.
  return noBlock
    .split(/\r\n|\r|\n/)
    .map((ln) => {
      const idx = ln.indexOf('--');
      return idx === -1 ? ln : ln.slice(0, idx);
    })
    .join('\n');
}

/**
 * Permit exactly one SELECT/WITH statement; reject everything else.
 *
 * Guards against non-read statements, statements smuggled after a comment, and
 * multi-statement payloads (`select 1; delete ...`).
 */
export function assertReadOnly(sql: string): void {
  const cleaned = stripComments(sql);
  const statements = cleaned.split(';').filter((s) => s.trim());
  if (statements.length > 1) {
    throw new ValidationError('Only a single read-only statement is permitted.');
  }
  const head = (statements[0] ?? '').trimStart().toLowerCase();
  if (!(head.startsWith('select') || head.startsWith('with'))) {
    throw new ValidationError('Only read-only SELECT/WITH queries are permitted.');
  }
}

/** Run a read-only query and return all rows. */
export async function runQuery(sql: string, params: unknown[] = []): Promise<Row[]> {
  assertReadOnly(sql);
  const result = await getPool().query(sql, params);
  return result.rows as Row[];
}

/**
 * Yield rows one at a time without materializing the whole result set, using a
 * server-side cursor (port of stream_query). For large exports — the full audience can
 * be tens of thousands of rows. Subject to the same SELECT/WITH-only guard.
 */
export async function* streamQuery(
  sql: string,
  params: unknown[] = [],
): AsyncGenerator<Row, void, unknown> {
  assertReadOnly(sql);
  const client: PoolClient = await getPool().connect();
  const cursor = client.query(new Cursor(sql, params));
  const readBatch = (n: number): Promise<Row[]> =>
    new Promise((resolve, reject) => {
      cursor.read(n, (err: Error | undefined, rows: Row[]) =>
        err ? reject(err) : resolve(rows),
      );
    });
  try {
    for (;;) {
      const rows = await readBatch(200);
      if (rows.length === 0) break;
      for (const row of rows) yield row;
    }
  } finally {
    await new Promise<void>((resolve) => cursor.close(() => resolve()));
    client.release();
  }
}
