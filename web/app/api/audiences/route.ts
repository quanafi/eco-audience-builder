/**
 * Saved audiences API (PROTOTYPE: mock store, see web/lib/audiences.ts).
 * Port of app/server.py `/api/audiences` GET + POST handlers.
 *
 *   GET  /api/audiences  → { audiences: SavedAudience[] }
 *   POST /api/audiences  ← { name, filters } → { ok, id, audience, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { listAudiences, saveAudience } from '@/lib/audiences';
import { ValidationError, withApiErrors } from '@/lib/errors';
import type { FilterPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async () => {
  return NextResponse.json({ audiences: listAudiences() });
});

export const POST = withApiErrors(async (req: NextRequest) => {
  // request.get_json(silent=True) or {} — a malformed body becomes an empty object.
  const body = (await req.json().catch(() => ({}))) as unknown;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const { name, filters } = body as { name?: unknown; filters?: unknown };
  if (name != null && typeof name !== 'string') {
    throw new ValidationError('name must be a string.');
  }
  if (filters != null && (typeof filters !== 'object' || Array.isArray(filters))) {
    throw new ValidationError('filters must be a JSON object.');
  }

  // Match app/audiences.py: a blank/missing name is defaulted to "Untitled audience"
  // (not a 400); a missing filters object becomes {}.
  return NextResponse.json(
    saveAudience((name as string | undefined) ?? '', (filters as FilterPayload | undefined) ?? {}),
  );
});
