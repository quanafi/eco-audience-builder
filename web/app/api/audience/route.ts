/**
 * POST /api/audience — stats + preview rows + facet counts for a filter payload.
 *
 * Port of the Flask `/api/audience` handler: parse the JSON body (a malformed or empty
 * body falls back to {}, mirroring `request.get_json(silent=True) or {}`), delegate to
 * runAudience, and let withApiErrors map a ValidationError → 400, anything else → 500.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runAudience } from '@/lib/audience';
import { withApiErrors } from '@/lib/errors';
import type { FilterPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiErrors(async (req: NextRequest) => {
  const payload = ((await req.json().catch(() => null)) ?? {}) as FilterPayload;
  return NextResponse.json(await runAudience(payload));
});
