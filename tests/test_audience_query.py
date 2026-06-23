"""Tests for the WHERE-clause builders in app.audience_query.

These exercise the two public builders:

  * build_filters(payload)      -> (where_clauses, bind_params) executed by run_audience
  * build_display_sql(payload)  -> copy-pasteable SELECT with validated literals inlined

Both must produce the *same* filter semantics from the same payload — that shared
contract is what the builders being unified is meant to guarantee, so it is what we
assert here. We deliberately avoid asserting on internal bind-param *names* (an
implementation detail); we assert on param values and on the SQL/params consistency
invariant instead.
"""
from __future__ import annotations

import re

import pytest

from app import audience_query as aq


# --- helpers ---------------------------------------------------------------

def bind_names(clauses) -> list[str]:
    """Every :name referenced across a list of WHERE clauses."""
    return re.findall(r":(\w+)", "\n".join(clauses))


def assert_consistent(where, params):
    """Every bind referenced in SQL is supplied, and every supplied param is used."""
    referenced = set(bind_names(where))
    supplied = set(params)
    assert referenced == supplied, f"referenced={referenced} supplied={supplied}"


@pytest.fixture(autouse=True)
def stub_tag_vocab(monkeypatch):
    """Avoid the DB: pin the valid-tag vocabulary used by tag filtering."""
    monkeypatch.setattr(aq, "_valid_tags", lambda: {"VIP", "Repair", "Install"})


# --- empty / no-op ---------------------------------------------------------

def test_empty_payload_has_no_clauses():
    where, params = aq.build_filters({})
    assert where == []
    assert params == {}


def test_empty_payload_display_sql_has_no_where():
    sql = aq.build_display_sql({})
    assert "\nwhere " not in sql
    assert sql.rstrip().endswith(";")


# --- allow-listed column filters (no binds) --------------------------------

def test_trades_or_grouped():
    where, params = aq.build_filters({"trades": ["Plumbing", "HVAC"]})
    assert where == ["(plumbing_customer = 1 or hvac_customer = 1)"]
    assert params == {}


def test_unknown_trade_is_rejected():
    where, _ = aq.build_filters({"trades": ["Plumbing", "Telepathy"]})
    assert where == ["(plumbing_customer = 1)"]


def test_regions_or_grouped():
    where, _ = aq.build_filters({"regions": ["Columbus", "Dayton"]})
    assert where == ["(is_columbus_customer = 1 or is_dayton_customer = 1)"]


def test_flags_use_allow_listed_expressions():
    where, _ = aq.build_filters({"flags": ["is_member", "has_email", "bogus"]})
    assert "is_member = 1" in where
    assert "(email is not null and email <> '')" in where
    assert len(where) == 2


# --- numeric comparisons ---------------------------------------------------

def test_recency_min_max_bind_values():
    where, params = aq.build_filters({"recencyMin": 30, "recencyMax": 365})
    assert len(where) == 2
    assert sorted(params.values()) == [30, 365]
    assert all(isinstance(v, int) for v in params.values())
    assert_consistent(where, params)


def test_recency_inlined_as_integers():
    sql = aq.build_display_sql({"recencyMin": 30, "recencyMax": 365})
    assert "days_since_last_job >= 30" in sql
    assert "days_since_last_job <= 365" in sql


def test_spend_bind_values_are_numeric():
    where, params = aq.build_filters({"spendMin": 1000, "spendMax": 5000})
    assert sorted(params.values()) == [1000, 5000]
    assert_consistent(where, params)


def test_spend_inlined_as_numbers():
    sql = aq.build_display_sql({"spendMin": 1000, "spendMax": 5000})
    assert "lifetime_revenue >= 1000" in sql
    assert "lifetime_revenue <= 5000" in sql


def test_blank_numeric_filters_are_ignored():
    where, params = aq.build_filters({"recencyMin": "", "spendMax": None})
    assert where == []
    assert params == {}


# --- list membership: zips -------------------------------------------------

def test_zip_cleaning_keeps_only_valid_five_digit():
    where, params = aq.build_filters({"zips": "43215, 9999, 12345 abc"})
    assert len(where) == 1
    # Both valid ZIPs are bound (order preserved), junk dropped.
    assert list(params.values()) == [["43215", "12345"]]
    assert_consistent(where, params)


def test_zip_membership_inlined():
    sql = aq.build_display_sql({"zips": ["43215", "43210"]})
    assert "'43215'" in sql and "'43210'" in sql
    assert aq.ZIP_EXPR in sql


def test_zips_all_invalid_produce_no_clause():
    where, params = aq.build_filters({"zips": "abcde, 123"})
    assert where == []
    assert params == {}


# --- list membership: segments ---------------------------------------------

def test_segment_membership_bound_as_strings():
    where, params = aq.build_filters({"revenueSegments": ["High", "Mid"]})
    assert len(where) == 1
    assert "lifetime_revenue_segment" in where[0]
    assert list(params.values()) == [["High", "Mid"]]
    assert_consistent(where, params)


def test_segment_value_with_quote_is_escaped_in_display_sql():
    """Display SQL is advertised as safe to paste — single quotes must be doubled."""
    sql = aq.build_display_sql({"revenueSegments": ["O'Brien"]})
    assert "'O''Brien'" in sql


# --- list membership: tags (validated against vocabulary) ------------------

def test_tags_validated_against_vocabulary():
    where, params = aq.build_filters({"tags": ["VIP", "NotARealTag"]})
    assert len(where) == 1
    assert "exists (select 1 from" in where[0]
    assert aq.JOBS_TABLE in where[0]
    assert list(params.values()) == [["VIP"]]
    assert_consistent(where, params)


def test_tags_inlined_inside_exists_subquery():
    sql = aq.build_display_sql({"tags": ["VIP", "Repair"]})
    assert "exists (select 1 from" in sql
    assert "'VIP'" in sql and "'Repair'" in sql


# --- exclude set -----------------------------------------------------------

def test_exclude_clauses_are_negated():
    where, _ = aq.build_filters(
        {"trades": ["Plumbing"], "exclude": {"regions": ["Columbus"]}}
    )
    assert "(plumbing_customer = 1)" in where
    assert "not ((is_columbus_customer = 1))" in where


def test_exclude_binds_do_not_collide_with_include():
    where, params = aq.build_filters(
        {"recencyMin": 30, "exclude": {"recencyMin": 90}}
    )
    names = bind_names(where)
    assert len(names) == len(set(names)) == 2  # two distinct bind params
    assert sorted(params.values()) == [30, 90]
    assert_consistent(where, params)


def test_exclude_negated_in_display_sql():
    sql = aq.build_display_sql({"exclude": {"trades": ["HVAC"]}})
    assert "not ((hvac_customer = 1))" in sql


# --- combined: include + exclude stays internally consistent ---------------

def test_kitchen_sink_payload_is_consistent():
    payload = {
        "trades": ["Plumbing"],
        "regions": ["Columbus", "Dayton"],
        "recencyMin": 30,
        "spendMax": 5000,
        "zips": ["43215"],
        "revenueSegments": ["High"],
        "flags": ["is_member"],
        "tags": ["VIP"],
        "exclude": {"recencyMax": 10, "tags": ["Repair"]},
    }
    where, params = aq.build_filters(payload)
    assert_consistent(where, params)
    # Display SQL renders without raising and includes every filter family.
    sql = aq.build_display_sql(payload)
    assert "plumbing_customer = 1" in sql
    assert "not (" in sql
