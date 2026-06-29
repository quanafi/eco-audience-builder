/**
 * POST /api/ads/estimate — identifier coverage + a benchmark-based predicted match-rate
 * range per platform. Port of app/server.py `ads_estimate`. No upload, no creds.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrors } from '@/lib/errors';
import { estimate, PLATFORMS } from '@/lib/ads';
import type { FilterPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as {
    filters?: FilterPayload;
    platforms?: string[];
  };
  const filters = body.filters ?? {};
  const platforms = body.platforms ?? [...PLATFORMS];
  return NextResponse.json(await estimate(filters, platforms));
});
