/**
 * POST /api/tags/apply — ServiceTitan tag write-back (PROTOTYPE: mock client).
 *
 * Port of app/server.py `apply_tag`. Resolves the FULL matched audience (not the
 * 200-row preview) from the in-memory snapshot, then calls the mock ServiceTitan
 * client which logs the payload it would send. No real API call is made.
 */
import { NextRequest, NextResponse } from 'next/server';

import { ValidationError, withApiErrors } from '@/lib/errors';
import { applyTag } from '@/lib/servicetitan';
import { getSnapshot } from '@/lib/snapshotStore';
import type { FilterPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { filters?: FilterPayload; tag?: unknown };
  const filters = body.filters ?? {};
  const tag = (typeof body.tag === 'string' ? body.tag : '').trim();
  if (!tag) {
    throw new ValidationError('A tag name is required.');
  }

  // Resolve the FULL matched audience (not the 200-row preview) from the snapshot.
  const snap = await getSnapshot();
  const ids = snap.matchedIds(snap.matchMask(filters));
  if (!ids.length) {
    throw new ValidationError('No customers match these filters.');
  }

  const result = applyTag(tag, ids);
  return NextResponse.json({
    ok: true,
    count: result.wouldTag,
    message:
      `Would tag ${result.wouldTag.toLocaleString('en-US')} customers with '${tag}' ` +
      '— payload logged to the server console (mock, no API call made).',
  });
});
