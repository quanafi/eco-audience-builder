"""Flask app: serves the Audience Builder UI and the read-only query API."""
from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from .audience_query import run_audience
from .facets import get_facets

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


@app.post("/api/audience")
def audience():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(run_audience(payload))
    except Exception as exc:
        return jsonify({"error": f"{type(exc).__name__}: {exc}"}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), debug=True)
