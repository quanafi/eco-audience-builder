"""Tests for the in-memory snapshot filter/stat/facet engine (app.snapshot).

These build a small Snapshot via Snapshot.from_rows (no DB) and assert that
match_mask / stats / facet_counts / top_ids reproduce the SQL semantics that the
WHERE-clause builders in audience_query encode — including OR-within-group,
AND-across-groups, tag-vocabulary validation, and the three-valued-logic behavior
of the negated exclude set.
"""
from __future__ import annotations

import numpy as np

from app.snapshot import Snapshot

# Defaults for every customer column the warehouse query produces, so each test
# row only has to specify the fields it cares about.
_DEFAULTS = {
    "plumbing_customer": 0, "hvac_customer": 0, "electric_customer": 0,
    "is_columbus_customer": 0, "is_dayton_customer": 0,
    "is_cincinnati_customer": 0, "is_chillicothe_customer": 0,
    "is_member": 0, "is_repeat_customer": 0,
    "days_since_last_job": None, "lifetime_revenue": None, "address": None,
    "lifetime_revenue_segment": None, "frequency_segment": None,
    "paid_recency_segment": None, "has_email": False, "has_mobile": False,
}


def row(customer_id, **over):
    return {"customer_id": customer_id, **_DEFAULTS, **over}


def ids(snap, mask):
    return sorted(int(c) for c in snap.customer_id[mask])


def build():
    rows = [
        # 1: plumbing, Columbus, member+email, $1000, 10 days, zip 43215, High
        row(1, plumbing_customer=1, is_columbus_customer=1, is_member=1, has_email=True,
            lifetime_revenue=1000, days_since_last_job=10, address="1 A St, Columbus, OH 43215",
            lifetime_revenue_segment="High"),
        # 2: hvac, Dayton, mobile only, $5000, 100 days, zip 45402, Mid
        row(2, hvac_customer=1, is_dayton_customer=1, has_mobile=True,
            lifetime_revenue=5000, days_since_last_job=100, address="2 B St, Dayton, OH 45402",
            lifetime_revenue_segment="Mid"),
        # 3: electric, no contact, null revenue, null days, no zip, no segment
        row(3, electric_customer=1, address="no zip here"),
        # 4: plumbing+hvac, Columbus, member, $3000, 5 days, zip 43215, High
        row(4, plumbing_customer=1, hvac_customer=1, is_columbus_customer=1, is_member=1,
            has_email=True, lifetime_revenue=3000, days_since_last_job=5,
            address="4 D St, Columbus, OH 43215", lifetime_revenue_segment="High"),
    ]
    tag_rows = [
        {"customer_id": 1, "tag": "VIP"},
        {"customer_id": 2, "tag": "Repair"},
        {"customer_id": 4, "tag": "VIP"},
        {"customer_id": 4, "tag": "Install"},
    ]
    return Snapshot.from_rows(rows, tag_rows)


# --- empty / no-op ---------------------------------------------------------

def test_empty_payload_matches_everyone():
    snap = build()
    assert ids(snap, snap.match_mask({})) == [1, 2, 3, 4]


# --- OR within a group, AND across groups ----------------------------------

def test_trades_or_within_group():
    snap = build()
    assert ids(snap, snap.match_mask({"trades": ["Plumbing", "HVAC"]})) == [1, 2, 4]


def test_unknown_trade_is_ignored():
    snap = build()
    assert ids(snap, snap.match_mask({"trades": ["Plumbing", "Telepathy"]})) == [1, 4]


def test_trade_and_region_are_anded():
    snap = build()
    # Plumbing AND Columbus -> 1 and 4 (2 is hvac/Dayton, 3 is electric)
    assert ids(snap, snap.match_mask({"trades": ["Plumbing"], "regions": ["Columbus"]})) == [1, 4]


def test_multiple_flags_are_anded():
    snap = build()
    # member AND has_email -> 1 and 4 only
    assert ids(snap, snap.match_mask({"flags": ["is_member", "has_email"]})) == [1, 4]


# --- numeric ranges (null-aware) -------------------------------------------

def test_recency_range_excludes_null_days():
    snap = build()
    # days between 1 and 50 -> 1 (10) and 4 (5); 2 is 100, 3 is null
    assert ids(snap, snap.match_mask({"recencyMin": 1, "recencyMax": 50})) == [1, 4]


def test_spend_min_excludes_null_revenue():
    snap = build()
    assert ids(snap, snap.match_mask({"spendMin": 2000})) == [2, 4]


# --- zips parsed from address ----------------------------------------------

def test_zip_membership_from_parsed_address():
    snap = build()
    assert ids(snap, snap.match_mask({"zips": ["43215"]})) == [1, 4]


# --- segments --------------------------------------------------------------

def test_segment_membership():
    snap = build()
    assert ids(snap, snap.match_mask({"revenueSegments": ["High"]})) == [1, 4]


# --- tags: union + vocabulary validation -----------------------------------

def test_tag_union_and_unknown_tag_ignored():
    snap = build()
    # VIP -> {1,4}; NotARealTag dropped
    assert ids(snap, snap.match_mask({"tags": ["VIP", "NotARealTag"]})) == [1, 4]
    # VIP OR Repair -> {1,2,4}
    assert ids(snap, snap.match_mask({"tags": ["VIP", "Repair"]})) == [1, 2, 4]


def test_only_unknown_tags_means_no_tag_clause():
    snap = build()
    assert ids(snap, snap.match_mask({"tags": ["NotARealTag"]})) == [1, 2, 3, 4]


# --- exclude set: negation + three-valued logic ----------------------------

def test_exclude_negates_clause():
    snap = build()
    # everyone except Columbus customers (1, 4)
    assert ids(snap, snap.match_mask({"exclude": {"regions": ["Columbus"]}})) == [2, 3]


def test_exclude_on_nullable_column_drops_null_rows():
    snap = build()
    # exclude days <= 50: SQL `not (days <= 50)` keeps a row only where the
    # predicate is definitely FALSE. Row 3 (null days) -> predicate NULL -> dropped,
    # matching `not null` is not TRUE. Only row 2 (days 100) survives.
    assert ids(snap, snap.match_mask({"exclude": {"recencyMax": 50}})) == [2]


def test_include_and_exclude_combined():
    snap = build()
    # Plumbing include {1,4}, exclude tag VIP {1,4} -> empty
    assert ids(snap, snap.match_mask({"trades": ["Plumbing"], "exclude": {"tags": ["VIP"]}})) == []


# --- stats -----------------------------------------------------------------

def test_stats_ignore_null_revenue_in_avg_and_sum():
    snap = build()
    mask = snap.match_mask({})
    s = snap.stats(mask)
    assert s["audienceCount"] == 4
    # reach = has_email or has_mobile -> 1, 2, 4
    assert s["reachCount"] == 3
    # avg/sum over non-null revenue: 1000, 5000, 3000 (row 3 null ignored)
    assert s["totalValue"] == 9000.0
    assert s["avgValue"] == 3000.0


def test_stats_empty_mask_is_zeroed():
    snap = build()
    mask = np.zeros(snap.n, dtype=bool)
    s = snap.stats(mask)
    assert s == {"audienceCount": 0, "reachCount": 0, "avgValue": 0.0, "totalValue": 0.0}


# --- top_ids ordering ------------------------------------------------------

def test_top_ids_most_recent_first_nulls_last():
    snap = build()
    mask = snap.match_mask({})
    # days: 4->5, 1->10, 2->100, 3->null  => order 4,1,2,3
    assert snap.top_ids(mask, 10) == [4, 1, 2, 3]
    assert snap.top_ids(mask, 2) == [4, 1]


# --- facet counts ----------------------------------------------------------

def test_facet_counts_ignore_own_group_but_honor_others():
    snap = build()
    # Select Plumbing. Region counts should reflect plumbing customers per region
    # (1,4 both Columbus), while Trade counts still show each trade across everyone.
    fc = snap.facet_counts({"trades": ["Plumbing"]})
    assert fc["regions"]["Columbus"] == 2
    assert fc["regions"]["Dayton"] == 0
    # Trade group ignores its own Plumbing selection -> totals across all rows.
    assert fc["trades"]["Plumbing"] == 2
    assert fc["trades"]["HVAC"] == 2
    assert fc["trades"]["Electric"] == 1
    # Tags are intentionally not in the facet output.
    assert "tags" not in fc


# --- base + tag facets -----------------------------------------------------

def test_base_facets_totals():
    snap = build()
    bf = snap.base_facets()
    assert bf["baseCount"] == 4
    assert {o["value"]: o["count"] for o in bf["trades"]} == {"Plumbing": 2, "HVAC": 2, "Electric": 1}
    assert bf["flags"]["is_member"] == 2
    rev_seg = {o["value"]: o["count"] for o in bf["segments"]["revenueSegments"]}
    assert rev_seg == {"High": 2, "Mid": 1}


def test_tag_facets_sorted_by_reach_desc():
    snap = build()
    tf = snap.tag_facets()
    assert tf[0] == {"value": "VIP", "count": 2}
    assert {o["value"] for o in tf} == {"VIP", "Repair", "Install"}
