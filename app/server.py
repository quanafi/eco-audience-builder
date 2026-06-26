"""Flask app: serves the Audience Builder UI and the read-only query API."""
from __future__ import annotations

import functools
import logging
import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import threading

from . import ads
from . import audiences as audiences_store
from . import servicetitan
from .audience_query import filter_config, run_audience
from .export import build_xlsx, stream_csv
from .facets import get_facets, get_tag_facets

_log = logging.getLogger(__name__)

# Fail-soft config check: warn (don't crash on import, so tests can import the app)
# if the warehouse connection is unset. db.get_engine() still raises a clear error
# the first time a query actually needs the DB.
if not os.environ.get("DATABASE_URL"):
    _log.warning("DATABASE_URL is not set; queries will fail until it is configured (.env).")

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

app = Flask(__name__, static_folder=None)


def api_errors(fn):
    """Wrap an /api view: a ValueError becomes a 400 with its message (user-facing
    validation), anything else is logged and returns a generic 500 — internals never
    leak to the client. Response shape stays {"error": "..."}."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception:
            _log.exception("Unhandled error in %s", fn.__name__)
            return jsonify({"error": "Internal server error — check the server logs."}), 500
    return wrapper


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/api/config")
@api_errors
def config():
    # Canonical filter vocab (flags/trades/regions/segment groups) so the frontend
    # derives its lists from the backend instead of a hardcoded copy.
    return jsonify(filter_config())


@app.get("/api/facets")
@api_errors
def facets():
    return jsonify(get_facets())


@app.get("/api/tags")
@api_errors
def tags():
    # The job-tag universe (~5s to compute) is loaded separately from /api/facets so it
    # never blocks initial page load. Cached after the first call (warmed at startup).
    return jsonify({"tags": get_tag_facets()})


@app.post("/api/audience")
@api_errors
def audience():
    payload = request.get_json(silent=True) or {}
    return jsonify(run_audience(payload))


@app.post("/api/export")
@api_errors
def export():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    columns = body.get("columns") or []
    fmt = (body.get("format") or "csv").lower()
    stamp = date.today().isoformat()
    if fmt == "xlsx":
        data = build_xlsx(columns, filters)
        return Response(
            data,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="audience-{stamp}.xlsx"'},
        )
    if fmt == "csv":
        return Response(
            stream_csv(columns, filters),
            mimetype="text/csv",
            headers={"Content-Disposition": f'attachment; filename="audience-{stamp}.csv"'},
        )
    raise ValueError(f"Unsupported format: {fmt}")


# ---- Saved audiences (PROTOTYPE: mock store, see app/audiences.py) -------------
@app.get("/api/audiences")
@api_errors
def list_audiences():
    return jsonify({"audiences": audiences_store.list_audiences()})


@app.post("/api/audiences")
@api_errors
def save_audience():
    body = request.get_json(silent=True) or {}
    name = body.get("name") or ""
    filters = body.get("filters") or {}
    return jsonify(audiences_store.save_audience(name, filters))


# ---- ServiceTitan tag write-back (PROTOTYPE: mock client, prints payload) -------
@app.post("/api/tags/apply")
@api_errors
def apply_tag():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    tag = (body.get("tag") or "").strip()
    if not tag:
        raise ValueError("A tag name is required.")
    # Resolve the FULL matched audience (not the 200-row preview) from the snapshot.
    from . import snapshot
    snap = snapshot.get_snapshot()
    ids = snap.matched_ids(snap.match_mask(filters))
    if not ids:
        raise ValueError("No customers match these filters.")
    result = servicetitan.apply_customer_tag(tag, ids)
    return jsonify({
        "ok": True,
        "count": result["wouldTag"],
        "message": f"Would tag {result['wouldTag']:,} customers with '{tag}' "
                   f"— payload logged to the server console (mock, no API call made).",
    })


# ---- Ad platforms (PROTOTYPE: dry-run mock, see app/ads.py) --------------------
@app.post("/api/ads/estimate")
@api_errors
def ads_estimate():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    platforms = body.get("platforms") or list(ads.PLATFORMS)
    return jsonify(ads.estimate(filters, platforms))


@app.post("/api/ads/send")
@api_errors
def ads_send():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    platform = (body.get("platform") or "").lower()
    if platform not in ads.PLATFORMS:
        raise ValueError("platform must be 'google' or 'meta'.")
    customers = ads.fetch_pii(filters)
    if not customers:
        raise ValueError("No customers match these filters.")
    result = ads.send_audience(platform, customers)
    label = "Google Ads" if platform == "google" else "Meta Ads"
    verb = "Dry run: would upload" if result["dryRun"] else "Uploaded"
    return jsonify({
        "ok": True,
        "platform": platform,
        "count": result["wouldSend"],
        "dryRun": result["dryRun"],
        "message": f"{verb} {result['wouldSend']:,} hashed records to {label} "
                   f"— payload logged to the server console (mock, no API call, "
                   f"no data left this server).",
    })


# Build the in-memory snapshot at startup (in the background so import never
# blocks on the warehouse) and schedule a daily rebuild. Every query path — facets,
# tags, audience filtering — reads from this snapshot. Best-effort: a failed build
# is retried lazily on the first request.
#
# NOTE (ops): the snapshot lives per-process, so run a single gunicorn worker with
# multiple threads, or use --preload, rather than N workers each holding a copy.
def _start_snapshot():
    from .snapshot import start_background_refresh
    start_background_refresh()


threading.Thread(target=_start_snapshot, daemon=True).start()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=True)
