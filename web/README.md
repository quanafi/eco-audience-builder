# Audience Builder — web (Next.js migration)

Next.js 14 (App Router) + TypeScript + TailwindCSS + Lucide + Recharts + `pg`. This is
the migration target for the Flask app at the repo root; the Python app stays runnable
until the final cutover.

## Stack
- **Next.js 14 App Router** — UI + API routes under `app/`.
- **`pg`** — read-only Postgres access (`lib/db.ts`), with Cloud SQL unix-socket support.
- **In-memory snapshot** (`lib/snapshot.ts`) — columnar typed-array port of the NumPy
  snapshot; sub-ms filtering, live facet counts, snapshot↔SQL parity.
- **Tailwind / Lucide / Recharts** — styling, icons, charts.

## Architecture (foundation)
```
lib/db.ts            pg.Pool + read-only guard (SELECT/WITH only), positional $N binds
lib/audienceQuery.ts allow-lists, BindRenderer ($N) / LiteralRenderer, buildFilters/buildDisplaySql
lib/customerColumns.ts COLUMN_CATALOG + buildColumnQuery (shared by export + ads)
lib/snapshot.ts      typed-array snapshot, three-valued exclude logic, facets/stats
lib/snapshotStore.ts process singleton + daily refresh + tag-vocab provider
lib/types.ts         shared API types
lib/editableSet.ts   UI filter-set shape <-> API payload (recency/spend preset mapping)
lib/format.ts        display formatters
lib/apiClient.ts     typed fetch wrappers
components/AudienceBuilder.tsx  central client state container
components/{sections,results,panels}/*  typed components (stubs replaced per Wave-2 unit)
app/api/*/route.ts   API routes (runtime = 'nodejs')
```

## Develop
```bash
npm install
cp .env.example .env.local   # set DATABASE_URL (or INSTANCE_CONNECTION_NAME for Cloud SQL)
npm run dev                  # http://localhost:3000
```

## Verify (no live DB needed)
```bash
npm run build        # next build (fails on type errors too)
npx tsc --noEmit     # explicit type check
npm test             # vitest; DB seam mocked, snapshot via fromRows fixtures
```

## Connection
- **TCP**: set `DATABASE_URL=postgresql://user:pass@host:5432/db`.
- **Cloud SQL (Cloud Run)**: set `INSTANCE_CONNECTION_NAME=project:region:instance` plus
  `PGUSER` / `PGPASSWORD` / `PGDATABASE`; `lib/db.ts` connects over `/cloudsql/<conn>`.

The snapshot lives in module state, so run a **single** server process (the Dockerfile
builds a standalone `node server.js`), the analogue of the single-gunicorn-worker model.
