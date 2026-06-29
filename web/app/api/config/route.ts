/**
 * GET /api/config — canonical filter vocabulary (flags/trades/regions/segment groups)
 * so the frontend derives its lists from the backend instead of a hardcoded copy.
 * Port of app/server.py `config`.
 */
import { NextResponse } from 'next/server';
import { filterConfig } from '@/lib/audienceQuery';
import { withApiErrors } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async () => NextResponse.json(filterConfig()));
