"""Tests for app.export: column resolution, value formatting, CSV formula-injection
neutralization, and the streaming CSV shape. No DB — stream_query and the snapshot's
available_suppress are stubbed.
"""
from __future__ import annotations

import csv
import datetime
import io

import pytest

from app import export


class _FakeSnap:
    available_suppress: set[str] = set()


@pytest.fixture(autouse=True)
def stub_snapshot(monkeypatch):
    from app import snapshot
    monkeypatch.setattr(snapshot, "get_snapshot", lambda: _FakeSnap())


# --- _resolve_columns -----------------------------------------------------
def test_resolve_drops_unknown_keeps_known():
    assert export._resolve_columns(["name", "totally_bogus"]) == ["name"]


def test_resolve_orders_by_catalog_not_request():
    assert export._resolve_columns(["zip", "customer_id", "name"]) == ["customer_id", "name", "zip"]


def test_resolve_empty_falls_back_to_default():
    assert export._resolve_columns([]) == export.DEFAULT_COLUMNS


def test_resolve_all_unknown_falls_back_to_default():
    assert export._resolve_columns(["nope", "nada"]) == export.DEFAULT_COLUMNS


# --- _format --------------------------------------------------------------
def test_format_none_is_empty_string():
    assert export._format("str", None) == ""


def test_format_bool():
    assert export._format("bool", True) == "Yes"
    assert export._format("bool", False) == "No"


def test_format_money_rounds():
    assert export._format("money", 1000) == 1000.0


def test_format_int_coerces():
    assert export._format("int", 3.0) == 3


def test_format_date_iso():
    assert export._format("date", datetime.date(2026, 6, 26)) == "2026-06-26"


# --- _csv_safe (formula-injection neutralization) -------------------------
@pytest.mark.parametrize("bad", ["=cmd|x", "+1+1", "-2", "@SUM(A1)", "\ttab", "\rcr"])
def test_csv_safe_prefixes_formula_triggers(bad):
    assert export._csv_safe(bad) == "'" + bad


def test_csv_safe_passes_plain_text():
    assert export._csv_safe("Acme Plumbing") == "Acme Plumbing"


def test_csv_safe_passes_non_strings():
    assert export._csv_safe(123) == 123
    assert export._csv_safe(None) is None


# --- stream_csv -----------------------------------------------------------
def test_stream_csv_header_hyperlink_and_neutralized_name(monkeypatch):
    rows = [{"customer_id": 7, "name": "=Evil()", "email": "a@b.com"}]
    monkeypatch.setattr(export, "stream_query", lambda sql, params: iter(rows))

    out = "".join(export.stream_csv(["customer_id", "name", "email"], {}))
    parsed = list(csv.reader(io.StringIO(out)))

    assert parsed[0] == ["Customer ID", "Name", "Email"]
    assert parsed[1][0].startswith('=HYPERLINK(')      # customer_id stays a link formula
    assert "/customer/7" in parsed[1][0]
    assert parsed[1][1] == "'=Evil()"                  # untrusted name neutralized
    assert parsed[1][2] == "a@b.com"


# --- _build_query ---------------------------------------------------------
def test_build_query_gates_on_available_suppress(monkeypatch):
    from app import snapshot

    class S:
        available_suppress = {"do_not_mail"}

    monkeypatch.setattr(snapshot, "get_snapshot", lambda: S())
    sql, params = export._build_query(["customer_id"], {})
    assert "from edw2.customers" in sql
    assert "do_not_mail" in sql               # suppression gated in because column is available
    assert "order by last_completed_job desc nulls last" in sql
