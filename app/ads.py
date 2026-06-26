"""Push a customer audience to Google Ads (Customer Match) / Meta (Custom Audiences)
— PROTOTYPE (dry-run mock) client.

Marketing wants to size an audience's *match rate* before spending. There are no API
credentials yet, so this module runs a full harness in dry-run mode: it pulls the
matched customers' PII, normalizes + SHA-256 hashes it into the exact payload each
platform expects (app/ads_normalize.py), and — instead of uploading — logs a
truncated, hashed-only preview. When creds arrive, fill `.env` and uncomment the real
SDK blocks below; the rest of the pipeline is already in place.

Honesty note: a true match rate is only returned by the platform after a real upload.
`estimate()` reports identifier *coverage* plus a benchmark-based predicted *range*,
clearly labeled as an estimate (see ads_normalize.estimate_match_rate).

Because the PII query reuses the app's WHERE-builder — which always excludes
do-not-contact customers — opted-out customers never reach an ad platform.

TODO (post-migration, to go live):
  * Google: load developer token + OAuth (client id/secret, refresh token) and the
    Customer Match user-list id from Secret Manager; create an OfflineUserDataJob,
    addOperations in batches of <=100k identifiers, then run the job. Handle the
    user-list creation, partial-failure reporting, and the ~hours-long match delay.
  * Meta: load a system-user access token + ad-account id + custom-audience id; POST
    to /{audience_id}/users with the hashed schema+data in batches of <=10k.
  * Both: respect rate limits with retry/backoff, run large audiences as an async job
    with an audit record (who/what/when), and make uploads idempotent.
"""
from __future__ import annotations

import json
import os

from . import ads_normalize as norm

# Defaults to dry-run so nothing ever calls a live API until explicitly turned off.
ADS_DRY_RUN = os.environ.get("ADS_DRY_RUN", "true").lower() != "false"

PLATFORMS = ("google", "meta")

# Illustrative endpoints echoed in the dry-run log — real ids come from config.
_MOCK_ENDPOINTS = {
    "google": "POST https://googleads.googleapis.com/v17/customers/{customer_id}/offlineUserDataJobs:addOperations",
    "meta": "POST https://graph.facebook.com/v20.0/{audience_id}/users",
}
_SAMPLE_RECORDS = 3  # how many hashed records to echo in the log (full set sent for real)

# PII columns to pull for hashing (keys mirror app/export.py COLUMN_CATALOG).
_PII_COLUMNS = ["customer_id", "name", "email", "phone_number", "zip"]


def fetch_pii(filters: dict) -> list[dict]:
    """Fetch the matched audience's PII from the warehouse, streamed (the audience can
    be tens of thousands of rows). Reuses export's query builder, so the same
    always-on do-not-contact exclusion applies."""
    from .db import stream_query
    from .export import _build_query

    sql, params = _build_query(_PII_COLUMNS, filters or {})
    return list(stream_query(sql, params))


def estimate(filters: dict, platforms: list[str] | None = None) -> dict:
    """Identifier coverage + a benchmark-based predicted match-rate range per platform.
    No upload, no creds — safe to call any time."""
    platforms = [p for p in (platforms or list(PLATFORMS)) if p in PLATFORMS] or list(PLATFORMS)
    customers = fetch_pii(filters)
    cov = norm.coverage(customers)
    return {
        "audienceCount": cov["total"],
        "coverage": cov,
        "platforms": {p: norm.estimate_match_rate(cov, p) for p in platforms},
    }


def build_payload(platform: str, customers: list[dict]) -> dict:
    """Build the platform-specific hashed-record payload for one upload."""
    if platform == "google":
        records = [ids for c in customers if (ids := norm.google_user_identifiers(c))]
        return {"platform": "google", "endpoint": _MOCK_ENDPOINTS["google"],
                "userIdentifiers": records, "count": len(records)}
    if platform == "meta":
        data = [norm.meta_user_record(c) for c in customers]
        return {"platform": "meta", "endpoint": _MOCK_ENDPOINTS["meta"],
                "schema": norm.META_SCHEMA, "data": data, "count": len(data)}
    raise ValueError(f"Unknown platform: {platform!r}")


def send_audience(platform: str, customers: list[dict]) -> dict:
    """MOCK (dry-run): build the hashed payload, log a truncated preview, return a stub.

    No raw PII is ever logged — only SHA-256 hashes. No network call is made while
    ADS_DRY_RUN is true.
    """
    if platform not in PLATFORMS:
        raise ValueError(f"Unknown platform: {platform!r}")
    payload = build_payload(platform, customers)

    if ADS_DRY_RUN:
        preview = _truncated_preview(platform, payload)
        print(f"[ads MOCK] would upload to {platform}:\n" + json.dumps(preview, indent=2), flush=True)
        return {"ok": True, "platform": platform, "wouldSend": payload["count"], "dryRun": True}

    # --- LIVE UPLOAD (wired up for when credentials arrive) ----------------------
    # Uncomment after adding the SDK to pyproject.toml and the creds to .env / Secret
    # Manager. Each block uploads `payload` in batches; see the module TODO above.
    #
    # if platform == "google":
    #     from google.ads.googleads.client import GoogleAdsClient
    #     client = GoogleAdsClient.load_from_env()          # GOOGLE_ADS_* env vars
    #     customer_id = os.environ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"]
    #     list_id = os.environ["GOOGLE_ADS_CUSTOMER_MATCH_LIST_ID"]
    #     # 1) offlineUserDataJobService.create_offline_user_data_job(customer_match_user_list_metadata=list_id)
    #     # 2) add_offline_user_data_job_operations(job, payload["userIdentifiers"])  # batches of <=100k
    #     # 3) run_offline_user_data_job(job); poll until the match completes
    #     raise NotImplementedError("Google Ads live upload not wired yet")
    #
    # if platform == "meta":
    #     import requests
    #     token = os.environ["META_ACCESS_TOKEN"]
    #     audience_id = os.environ["META_CUSTOM_AUDIENCE_ID"]
    #     url = f"https://graph.facebook.com/v20.0/{audience_id}/users"
    #     for batch in _batches(payload["data"], 10000):
    #         requests.post(url, params={"access_token": token}, json={
    #             "payload": {"schema": payload["schema"], "data": batch}})
    #     raise NotImplementedError("Meta live upload not wired yet")

    raise RuntimeError("ADS_DRY_RUN is off but no live client is configured.")


def _truncated_preview(platform: str, payload: dict) -> dict:
    """A console-safe copy of the payload with the (large) record list trimmed."""
    preview = dict(payload)
    key = "userIdentifiers" if platform == "google" else "data"
    records = payload.get(key, [])
    if len(records) > _SAMPLE_RECORDS:
        preview[key] = records[:_SAMPLE_RECORDS] + [f"...(+{len(records) - _SAMPLE_RECORDS} more)"]
    return preview
