/**
 * GET /api/facets — global (unfiltered) facet totals for the filter UI.
 * Port of app/server.py `facets`.
 */
import { NextResponse } from 'next/server';
import { getFacets } from '@/lib/facets';
import { withApiErrors } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async () => NextResponse.json(await getFacets()));
