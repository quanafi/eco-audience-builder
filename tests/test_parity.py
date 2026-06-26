"""Anti-drift parity tests: the SQL builder (app.audience_query) and the in-memory
NumPy matcher (app.snapshot) encode the same filter semantics by hand, so they must
agree. For one dataset and a battery of payloads covering every filter dimension we
assert (a) snapshot.match_mask returns the hand-computed IDs and (b) build_display_sql
emits the corresponding clause — pinning both paths to the same payload contract.

If someone changes one builder and not the other, a case here breaks.
"""
from __future__ import annotations

import re

import pytest

from app import audience_query as aq
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
    rows = [
        _row(1, plumbing_customer=1, is_columbus_customer=1, is_member=1, has_email=True,
             lifetime_revenue=1000, days_since_last_job=10, address="1 A St, Columbus, OH 43215",
             lifetime_revenue_segment="High"),
        _row(2, hvac_customer=1, is_dayton_customer=1, has_mobile=True,
             lifetime_revenue=5000, days_since_last_job=100, address="2 B St, Dayton, OH 45402",
             lifetime_revenue_segment="Mid"),
        _row(3, electric_customer=1, address="no zip here"),
        _row(4, plumbing_customer=1, hvac_customer=1, is_columbus_customer=1, is_member=1,
             has_email=True, lifetime_revenue=3000, days_since_last_job=5,
             address="4 D St, Columbus, OH 43215", lifetime_revenue_segment="High"),
    ]
    tags = [
        {"customer_id": 1, "tag": "VIP"},
        {"customer_id": 2, "tag": "Repair"},
        {"customer_id": 4, "tag": "VIP"},
        {"customer_id": 4, "tag": "Install"},
    ]
    return Snapshot.from_rows(rows, tags)


def _ids(snap, payload):
    mask = snap.match_mask(payload)
    return sorted(int(c) for c in snap.customer_id[mask])


@pytest.fixture(autouse=True)
def stub_tag_vocab(monkeypatch):
    monkeypatch.setattr(aq, "_valid_tags", lambda: {"VIP", "Repair", "Install"})


# name, payload, expected ids (snapshot), substrings expected in the display SQL
_CASES = [
    ("trades_single", {"trades": ["Plumbing"]}, [1, 4], ["plumbing_customer = 1"]),
    ("trades_or", {"trades": ["Plumbing", "HVAC"]}, [1, 2, 4],
     ["plumbing_customer = 1 or hvac_customer = 1"]),
    ("regions", {"regions": ["Columbus"]}, [1, 4], ["is_columbus_customer = 1"]),
    ("recency_max", {"recencyMax": 50}, [1, 4], ["days_since_last_job <= 50"]),
    ("recency_min", {"recencyMin": 50}, [2], ["days_since_last_job >= 50"]),
    ("spend_min", {"spendMin": 2000}, [2, 4], ["lifetime_revenue >= 2000"]),
    ("spend_max", {"spendMax": 2000}, [1], ["lifetime_revenue <= 2000"]),  # row 3 null revenue excluded
    ("zips", {"zips": "43215"}, [1, 4], ["'43215'"]),
    ("segments", {"revenueSegments": ["High"]}, [1, 4], ["lifetime_revenue_segment in ('High')"]),
    ("flag_email", {"flags": ["has_email"]}, [1, 4], ["(email is not null and email <> '')"]),
    ("flag_member", {"flags": ["is_member"]}, [1, 4], ["is_member = 1"]),
    ("tags", {"tags": ["VIP"]}, [1, 4], ["exists", "'VIP'"]),
    ("exclude_trade", {"exclude": {"trades": ["HVAC"]}}, [1, 3], ["not ((hvac_customer = 1))"]),
    ("include_and_exclude", {"trades": ["Plumbing"], "exclude": {"tags": ["VIP"]}}, [], ["plumbing_customer = 1"]),
]


@pytest.mark.parametrize("name,payload,expected_ids,sql_substrings", _CASES,
                         ids=[c[0] for c in _CASES])
def test_snapshot_matches_expected_ids(name, payload, expected_ids, sql_substrings):
    assert _ids(_snap(), payload) == expected_ids


@pytest.mark.parametrize("name,payload,expected_ids,sql_substrings", _CASES,
                         ids=[c[0] for c in _CASES])
def test_display_sql_emits_corresponding_clause(name, payload, expected_ids, sql_substrings):
    sql = aq.build_display_sql(payload).lower()
    for sub in sql_substrings:
        assert sub.lower() in sql, f"{name}: expected {sub!r} in generated SQL"


@pytest.mark.parametrize("name,payload,expected_ids,sql_substrings", _CASES,
                         ids=[c[0] for c in _CASES])
def test_build_filters_params_are_consistent(name, payload, expected_ids, sql_substrings):
    where, params = aq.build_filters(payload)
    referenced = set(re.findall(r":(\w+)", "\n".join(where)))
    assert referenced == set(params), f"{name}: bind mismatch {referenced} vs {set(params)}"


def test_suppression_excludes_opted_out_in_both_paths():
    # Snapshot: opted-out customers never enter it (always-on, dropped at load).
    rows = [_row(1), _row(2, do_not_mail=True)]
    snap = Snapshot.from_rows(rows)
    assert _ids(snap, {}) == [1]
    # SQL: the suppression clause is emitted for the available channel.
    sql = aq.build_display_sql({}, available={"do_not_mail"})
    assert "not (do_not_mail is true)" in sql
