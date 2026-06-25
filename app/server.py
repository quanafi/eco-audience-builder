"""Flask app: serves the Audience Builder UI and the read-only query API."""
from __future__ import annotations

import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import threading

from . import audiences as audiences_store
from . import servicetitan
from .audience_query import run_audience
from .export import build_xlsx, stream_csv
from .facets import get_facets, get_tag_facets

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

app = Flask(__name__, static_folder=None)


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/api/facets")
def facets():
    try:
        return jsonify(get_facets())
    except Exception as exc:  # surface DB/config errors to the UI
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@app.get("/api/tags")
def tags():
    # The job-tag universe (~5s to compute) is loaded separately from /api/facets so it
    # never blocks initial page load. Cached after the first call (warmed at startup).
    try:
        return jsonify({"tags": get_tag_facets()})
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@app.post("/api/audience")
def audience():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(run_audience(payload))
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@app.post("/api/export")
def export():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    columns = body.get("columns") or []
    fmt = (body.get("format") or "csv").lower()
    stamp = date.today().isoformat()
    try:
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
        return jsonify({"error": f"Unsupported format: {fmt}"}), 400
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


# ---- Saved audiences (PROTOTYPE: mock store, see app/audiences.py) -------------
@app.get("/api/audiences")
def list_audiences():
    try:
        return jsonify({"audiences": audiences_store.list_audiences()})
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


@app.post("/api/audiences")
def save_audience():
    body = request.get_json(silent=True) or {}
    name = body.get("name") or ""
    filters = body.get("filters") or {}
    try:
        return jsonify(audiences_store.save_audience(name, filters))
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


# ---- ServiceTitan tag write-back (PROTOTYPE: mock client, prints payload) -------
@app.post("/api/tags/apply")
def apply_tag():
    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}
    tag = (body.get("tag") or "").strip()
    if not tag:
        return jsonify({"error": "A tag name is required."}), 400
    try:
        # Resolve the FULL matched audience (not the 200-row preview) from the snapshot.
        from . import snapshot
        snap = snapshot.get_snapshot()
        ids = snap.matched_ids(snap.match_mask(filters))
        if not ids:
            return jsonify({"error": "No customers match these filters."}), 400
        result = servicetitan.apply_customer_tag(tag, ids)
        return jsonify({
            "ok": True,
            "count": result["wouldTag"],
            "message": f"Would tag {result['wouldTag']:,} customers with '{tag}' "
                       f"— payload logged to the server console (mock, no API call made).",
        })
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


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
