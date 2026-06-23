"""Flask app: serves the Audience Builder UI and the read-only query API."""
from __future__ import annotations

import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import threading

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


# Warm the (slow) tag-facet cache in the background at import time so the first
# /api/tags request is usually instant. Best-effort: failures just mean the first
# real request computes it lazily.
def _warm_caches():
    try:
        get_facets()
        get_tag_facets()
    except Exception:
        pass


threading.Thread(target=_warm_caches, daemon=True).start()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=True)
