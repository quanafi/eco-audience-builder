/**
 * POST /api/ads/send — MOCK (dry-run) upload of the matched audience to an ad platform.
 * Port of app/server.py `ads_send`. Builds + hashes the payload, logs a hashed-only
 * preview, and returns a stub. No raw PII leaves the server; no network call is made
 * while ADS_DRY_RUN is on (the default).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrors, ValidationError } from '@/lib/errors';
import { fetchPii, sendAudience, isPlatform } from '@/lib/ads';
import { fmtInt } from '@/lib/format';
import type { FilterPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiErrors(async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as {
    filters?: FilterPayload;
    platform?: string;
  };
  const filters = body.filters ?? {};
  const platform = (body.platform ?? '').toLowerCase();
  if (!isPlatform(platform)) {
    throw new ValidationError("platform must be 'google' or 'meta'.");
  }
  const customers = await fetchPii(filters);
  if (customers.length === 0) {
    throw new ValidationError('No customers match these filters.');
  }
  const result = sendAudience(platform, customers);
  const label = platform === 'google' ? 'Google Ads' : 'Meta Ads';
  const verb = result.dryRun ? 'Dry run: would upload' : 'Uploaded';
  return NextResponse.json({
    ok: true,
    platform,
    count: result.wouldSend,
    dryRun: result.dryRun,
    message:
      `${verb} ${fmtInt(result.wouldSend)} hashed records to ${label} ` +
      '— payload logged to the server console (mock, no API call, ' +
      'no data left this server).',
  });
});
