"""ServiceTitan tag write-back — PROTOTYPE (mock) client.

The customer mart (edw2.customers) is a daily, read-only *mirror* of ServiceTitan,
so tags must be written to ServiceTitan itself (the system of record) — writing to
the warehouse would be overwritten on the next load and never reach ServiceTitan.

This mock builds the JSON payload that the real call would send and prints it to the
server console instead of calling the API.

TODO (post-migration):
  * Load OAuth client-credentials (client id/secret, app key, tenant id) from
    Secret Manager; exchange for a bearer token.
  * Replace the print with the real CRM tags call, applying the tag to customers in
    *batches* (audiences can be tens of thousands), respecting ServiceTitan rate
    limits with retry/backoff.
  * For large audiences run this as an async job (enqueue -> worker -> progress),
    write an audit record (who/what/when), and make it idempotent so a retry never
    double-applies.
"""
from __future__ import annotations

import json

# Illustrative only — the real tenant/endpoint come from Secret Manager config.
_MOCK_ENDPOINT = "POST https://api.servicetitan.io/crm/v2/tenant/{tenant}/tags/apply"
_SAMPLE_IDS = 20  # how many ids to echo in the printed payload (full list is sent for real)


def apply_customer_tag(tag: str, customer_ids: list[int]) -> dict:
    """MOCK: build the ServiceTitan tag payload, print it, and return a stub result.

    No network call is made. The printed payload shows exactly what the real
    integration would send.
    """
    tag = (tag or "").strip()
    customer_ids = [int(c) for c in customer_ids]

    payload = {
        "endpoint": _MOCK_ENDPOINT,
        "tag": tag,
        "customerIds": customer_ids,
        "count": len(customer_ids),
    }

    # Console-only echo. Truncate the id list so the log stays readable for big
    # audiences; the real call would send every id (in batches).
    preview = dict(payload)
    if len(customer_ids) > _SAMPLE_IDS:
        preview["customerIds"] = customer_ids[:_SAMPLE_IDS] + ["...(+%d more)" % (len(customer_ids) - _SAMPLE_IDS)]
    print("[servicetitan MOCK] would apply customer tag:\n" + json.dumps(preview, indent=2), flush=True)

    return {
        "ok": True,
        "tag": tag,
        "wouldTag": len(customer_ids),
        # TODO: real call returns per-customer results / a job id here.
    }
