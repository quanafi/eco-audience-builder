/**
 * ServiceTitan tag write-back — PROTOTYPE (mock) client.
 *
 * Port of app/servicetitan.py. The customer mart (edw2.customers) is a daily,
 * read-only *mirror* of ServiceTitan, so tags must be written to ServiceTitan itself
 * (the system of record) — writing to the warehouse would be overwritten on the next
 * load and never reach ServiceTitan.
 *
 * This mock builds the JSON payload the real call would send and console.logs it
 * instead of calling the API.
 *
 * TODO (post-migration):
 *   * Load OAuth client-credentials (client id/secret, app key, tenant id) from
 *     Secret Manager; exchange for a bearer token.
 *   * Replace the log with the real CRM tags call, applying the tag to customers in
 *     *batches* (audiences can be tens of thousands), respecting ServiceTitan rate
 *     limits with retry/backoff.
 *   * For large audiences run this as an async job (enqueue -> worker -> progress),
 *     write an audit record (who/what/when), and make it idempotent so a retry never
 *     double-applies.
 */

// Illustrative only — the real tenant/endpoint come from Secret Manager config.
const MOCK_ENDPOINT = 'POST https://api.servicetitan.io/crm/v2/tenant/{tenant}/tags/apply';
const SAMPLE_IDS = 20; // how many ids to echo in the printed payload (full list is sent for real)

/** Stub result of the mock apply (mirrors the Python dict). */
export interface ApplyTagResult {
  ok: true;
  tag: string;
  wouldTag: number;
}

/**
 * MOCK: build the ServiceTitan tag payload, log it, and return a stub result.
 *
 * No network call is made. The logged payload shows exactly what the real
 * integration would send.
 */
export function applyTag(tag: string, customerIds: number[]): ApplyTagResult {
  const cleanTag = (tag || '').trim();
  const ids = customerIds.map((c) => Math.trunc(Number(c)));

  const payload = {
    endpoint: MOCK_ENDPOINT,
    tag: cleanTag,
    customerIds: ids as (number | string)[],
    count: ids.length,
  };

  // Console-only echo. Truncate the id list so the log stays readable for big
  // audiences; the real call would send every id (in batches).
  const preview = { ...payload };
  if (ids.length > SAMPLE_IDS) {
    preview.customerIds = [...ids.slice(0, SAMPLE_IDS), `...(+${ids.length - SAMPLE_IDS} more)`];
  }
  console.log('[servicetitan MOCK] would apply customer tag:\n' + JSON.stringify(preview, null, 2));

  return {
    ok: true,
    tag: cleanTag,
    wouldTag: ids.length,
    // TODO: real call returns per-customer results / a job id here.
  };
}
