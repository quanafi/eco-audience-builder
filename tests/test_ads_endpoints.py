"""Smoke tests for the /api/ads/* endpoints.

PII fetching is monkeypatched to fixed dicts so these need no DB and make no network
call (dry-run is the default). They assert the wiring: estimate returns coverage +
per-platform predicted ranges; send returns a dry-run stub.
"""
from __future__ import annotations

import pytest

from app import ads, server


@pytest.fixture
def client():
    server.app.config.update(TESTING=True)
    return server.app.test_client()


@pytest.fixture(autouse=True)
def fixed_pii(monkeypatch):
    """No DB: a small, fixed audience with mixed identifier coverage."""
    rows = [
        {"customer_id": 1, "email": "a@x.com", "phone_number": "(614) 555-0001", "name": "Ann Lee", "zip": "43215"},
        {"customer_id": 2, "email": "b@x.com", "phone_number": "", "name": "", "zip": ""},
        {"customer_id": 3, "email": "", "phone_number": "6145550003", "name": "Cy Poe", "zip": "43220"},
    ]
    monkeypatch.setattr(ads, "fetch_pii", lambda filters: rows)
    return rows


def test_estimate_returns_coverage_and_platform_ranges(client):
    res = client.post("/api/ads/estimate", json={"filters": {}, "platforms": ["google", "meta"]})
    assert res.status_code == 200
    data = res.get_json()
    assert data["audienceCount"] == 3
    assert data["coverage"]["hasEmail"] == 2
    for p in ("google", "meta"):
        est = data["platforms"][p]
        assert {"lowPct", "highPct", "lowCount", "highCount", "basis", "disclaimer"} <= set(est)
        assert "NOT a" in est["disclaimer"]


def test_send_is_dry_run(client):
    res = client.post("/api/ads/send", json={"filters": {}, "platform": "google"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["dryRun"] is True
    assert data["count"] == 3
    assert "Dry run" in data["message"]


def test_send_rejects_unknown_platform(client):
    res = client.post("/api/ads/send", json={"filters": {}, "platform": "tiktok"})
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_send_empty_audience_is_400(client, monkeypatch):
    monkeypatch.setattr(ads, "fetch_pii", lambda filters: [])
    res = client.post("/api/ads/send", json={"filters": {}, "platform": "meta"})
    assert res.status_code == 400
    assert "No customers" in res.get_json()["error"]
