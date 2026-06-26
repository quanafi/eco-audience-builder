"""Integration tests for the HTTP API (app.server) via Flask's test client.

The DB seams are monkeypatched (snapshot.get_snapshot, the preview-row fetch, and the
export row stream), so these need no warehouse. They assert endpoint wiring, response
shapes, and the centralized error handling (ValueError -> 400, anything else -> a
generic 500 that does not leak internals).
"""
from __future__ import annotations

import pytest

from app import audience_query as aq
from app import server
from app import snapshot as snap_mod
from app.snapshot import Snapshot

_DEFAULTS = {
    "plumbing_customer": 0, "hvac_customer": 0, "electric_customer": 0,
    "is_columbus_customer": 0, "is_dayton_customer": 0,
    "is_cincinnati_customer": 0, "is_chillicothe_customer": 0,
    "is_member": 0, "is_repeat_customer": 0,
    "days_since_last_job": None, "lifetime_revenue": None, "address": None,
    "lifetime_revenue_segment": None, "frequency_segment": None,
    "paid_recency_segment": None, "has_email": False, "has_mobile": False,
    "do_not_mail": False, "do_not_service": False, "do_not_text": False,
}


def _row(cid, **over):
    return {"customer_id": cid, **_DEFAULTS, **over}


def _snap():
    return Snapshot.from_rows([
        _row(1, plumbing_customer=1, has_email=True, lifetime_revenue=1000, days_since_last_job=10),
        _row(2, hvac_customer=1, has_mobile=True, lifetime_revenue=5000, days_since_last_job=50),
    ])


@pytest.fixture
def client():
    server.app.config.update(TESTING=True)
    return server.app.test_client()


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    monkeypatch.setattr(snap_mod, "get_snapshot", lambda: _snap())
    monkeypatch.setattr(aq, "_fetch_preview_rows", lambda ids: [])
    from app import export
    monkeypatch.setattr(export, "stream_query", lambda sql, params: iter([]))


# --- happy paths ----------------------------------------------------------
def test_config_returns_backend_vocab(client):
    data = client.get("/api/config").get_json()
    assert {"flags", "trades", "regions", "segmentGroups"} <= set(data)
    assert {f["f"] for f in data["flags"]} == {"is_member", "has_email", "has_mobile", "is_repeat_customer"}
    assert "Plumbing" in data["trades"]


def test_facets_returns_base_counts(client):
    data = client.get("/api/facets").get_json()
    assert data["baseCount"] == 2
    assert "trades" in data and "suppress" not in data  # suppression is not a user facet


def test_audience_returns_counts_and_sql(client):
    res = client.post("/api/audience", json={"trades": ["Plumbing"]})
    assert res.status_code == 200
    data = res.get_json()
    assert data["audienceCount"] == 1            # only customer 1 is Plumbing
    assert data["baseCount"] == 2
    assert "select" in data["sql"].lower()


def test_export_csv_streams_with_headers(client):
    res = client.post("/api/export", json={"filters": {}, "columns": ["customer_id", "name"], "format": "csv"})
    assert res.status_code == 200
    assert res.mimetype == "text/csv"
    assert "attachment" in res.headers["Content-Disposition"]
    assert res.get_data(as_text=True).splitlines()[0] == "Customer ID,Name"


def test_export_unsupported_format_is_400(client):
    res = client.post("/api/export", json={"filters": {}, "format": "pdf"})
    assert res.status_code == 400
    assert "Unsupported format" in res.get_json()["error"]


def test_audiences_list_and_save(client):
    assert isinstance(client.get("/api/audiences").get_json()["audiences"], list)
    saved = client.post("/api/audiences", json={"name": "  ", "filters": {"trades": ["HVAC"]}}).get_json()
    assert saved["ok"] is True
    assert saved["audience"]["name"] == "Untitled audience"   # blank name defaulted


def test_tags_apply_counts_matched(client):
    res = client.post("/api/tags/apply", json={"filters": {}, "tag": "Spring promo"})
    assert res.status_code == 200
    assert res.get_json()["count"] == 2


# --- error handling -------------------------------------------------------
def test_tags_apply_requires_tag_is_400(client):
    res = client.post("/api/tags/apply", json={"filters": {}})
    assert res.status_code == 400
    assert res.get_json()["error"] == "A tag name is required."


def test_unhandled_error_is_generic_500(client, monkeypatch):
    def boom(payload):
        raise RuntimeError("secret internal detail")
    monkeypatch.setattr(server, "run_audience", boom)
    res = client.post("/api/audience", json={})
    assert res.status_code == 500
    body = res.get_json()
    assert "secret internal detail" not in body["error"]   # internals never leak
    assert "server logs" in body["error"]
