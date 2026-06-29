/**
 * GET /api/tags — the job-tag universe (~5s to compute), loaded separately from
 * /api/facets so it never blocks initial page load. Cached via the snapshot, which is
 * warmed at startup. Port of app/server.py `tags`.
 */
import { NextResponse } from 'next/server';
import { getTagFacets } from '@/lib/facets';
import { withApiErrors } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiErrors(async () => NextResponse.json({ tags: await getTagFacets() }));
