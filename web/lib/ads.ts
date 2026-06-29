/**
 * Push a customer audience to Google Ads (Customer Match) / Meta (Custom Audiences) —
 * PROTOTYPE (dry-run mock) client. Port of app/ads.py.
 *
 * Marketing wants to size an audience's *match rate* before spending. There are no API
 * credentials yet, so this module runs a full harness in dry-run mode: it pulls the
 * matched customers' PII, normalizes + SHA-256 hashes it into the exact payload each
 * platform expects (lib/adsNormalize.ts), and — instead of uploading — logs a
 * truncated, hashed-only preview. When creds arrive, fill `.env` and wire the real SDK
 * blocks; the rest of the pipeline is already in place.
 *
 * Honesty note: a true match rate is only returned by the platform after a real upload.
 * `estimate()` reports identifier *coverage* plus a benchmark-based predicted *range*,
 * clearly labeled as an estimate (see adsNormalize.estimateMatchRate).
 *
 * Because the PII query reuses the app's WHERE-builder (buildColumnQuery) — which always
 * excludes do-not-contact customers — opted-out customers never reach an ad platform.
 */
import { streamQuery } from './db';
import { buildColumnQuery } from './customerColumns';
import { getSnapshot } from './snapshotStore';
import { ValidationError } from './errors';
import {
  coverage,
  estimateMatchRate,
  googleUserIdentifiers,
  metaUserRecord,
  META_SCHEMA,
  type PiiCustomer,
} from './adsNormalize';
import type { AdsEstimate, FilterPayload } from './types';

// Defaults to dry-run so nothing ever calls a live API until explicitly turned off.
export const ADS_DRY_RUN = (process.env.ADS_DRY_RUN ?? 'true').toLowerCase() !== 'false';

export const PLATFORMS = ['google', 'meta'] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(p: string): p is Platform {
  return (PLATFORMS as readonly string[]).includes(p);
}

// Illustrative endpoints echoed in the dry-run log — real ids come from config.
const MOCK_ENDPOINTS: Record<Platform, string> = {
  google:
    'POST https://googleads.googleapis.com/v17/customers/{customer_id}/offlineUserDataJobs:addOperations',
  meta: 'POST https://graph.facebook.com/v20.0/{audience_id}/users',
};
const SAMPLE_RECORDS = 3; // how many hashed records to echo in the log (full set sent for real)

// PII columns to pull for hashing (keys mirror customerColumns COLUMN_CATALOG).
const PII_COLUMNS = ['customer_id', 'name', 'email', 'phone_number', 'zip'];

/** Fetch the matched audience's PII from the warehouse, streamed (the audience can be
 * tens of thousands of rows). Reuses customerColumns' query builder gated to the
 * snapshot's available suppression columns, so the same always-on do-not-contact
 * exclusion applies. */
export async function fetchPii(filters: FilterPayload): Promise<PiiCustomer[]> {
  const snapshot = await getSnapshot();
  const { sql, params } = buildColumnQuery(PII_COLUMNS, filters ?? {}, snapshot.availableSuppress);
  const rows: PiiCustomer[] = [];
  for await (const row of streamQuery(sql, params)) {
    rows.push(row as PiiCustomer);
  }
  return rows;
}

/** Identifier coverage + a benchmark-based predicted match-rate range per platform. No
 * upload, no creds — safe to call any time. */
export async function estimate(
  filters: FilterPayload,
  platforms?: string[] | null,
): Promise<AdsEstimate> {
  const requested = (platforms ?? [...PLATFORMS]).filter(isPlatform);
  const chosen: Platform[] = requested.length ? requested : [...PLATFORMS];
  const customers = await fetchPii(filters);
  const cov = coverage(customers);
  const out: Record<string, ReturnType<typeof estimateMatchRate>> = {};
  for (const p of chosen) out[p] = estimateMatchRate(cov, p);
  return {
    audienceCount: cov.total,
    coverage: cov,
    platforms: out,
  };
}

export interface GooglePayload {
  platform: 'google';
  endpoint: string;
  userIdentifiers: Record<string, unknown>[][];
  count: number;
}
export interface MetaPayload {
  platform: 'meta';
  endpoint: string;
  schema: string[];
  data: string[][];
  count: number;
}
export type AdsPayload = GooglePayload | MetaPayload;

/** Build the platform-specific hashed-record payload for one upload. */
export function buildPayload(platform: string, customers: PiiCustomer[]): AdsPayload {
  if (platform === 'google') {
    const records = customers
      .map((c) => googleUserIdentifiers(c))
      .filter((ids) => ids.length > 0);
    return {
      platform: 'google',
      endpoint: MOCK_ENDPOINTS.google,
      userIdentifiers: records,
      count: records.length,
    };
  }
  if (platform === 'meta') {
    const data = customers.map((c) => metaUserRecord(c));
    return {
      platform: 'meta',
      endpoint: MOCK_ENDPOINTS.meta,
      schema: META_SCHEMA,
      data,
      count: data.length,
    };
  }
  throw new ValidationError(`Unknown platform: ${platform}`);
}

export interface SendResult {
  ok: true;
  platform: string;
  wouldSend: number;
  dryRun: boolean;
}

/** A console-safe copy of the payload with the (large) record list trimmed. */
function truncatedPreview(platform: string, payload: AdsPayload): Record<string, unknown> {
  const preview: Record<string, unknown> = { ...payload };
  const key = platform === 'google' ? 'userIdentifiers' : 'data';
  const records = (payload as unknown as Record<string, unknown[]>)[key] ?? [];
  if (records.length > SAMPLE_RECORDS) {
    preview[key] = [
      ...records.slice(0, SAMPLE_RECORDS),
      `...(+${records.length - SAMPLE_RECORDS} more)`,
    ];
  }
  return preview;
}

/** MOCK (dry-run): build the hashed payload, log a truncated preview, return a stub.
 *
 * No raw PII is ever logged — only SHA-256 hashes. No network call is made while
 * ADS_DRY_RUN is true. */
export function sendAudience(platform: string, customers: PiiCustomer[]): SendResult {
  if (!isPlatform(platform)) {
    throw new ValidationError(`Unknown platform: ${platform}`);
  }
  const payload = buildPayload(platform, customers);

  if (ADS_DRY_RUN) {
    const preview = truncatedPreview(platform, payload);
    console.log(`[ads MOCK] would upload to ${platform}:\n` + JSON.stringify(preview, null, 2));
    return { ok: true, platform, wouldSend: payload.count, dryRun: true };
  }

  // --- LIVE UPLOAD (wired up for when credentials arrive) ----------------------
  // Wire the real SDK calls here once credentials are configured. Each platform uploads
  // `payload` in batches (Google <=100k identifiers via OfflineUserDataJob; Meta <=10k
  // rows to /{audience_id}/users), respecting rate limits with retry/backoff.
  throw new Error('ADS_DRY_RUN is off but no live client is configured.');
}
