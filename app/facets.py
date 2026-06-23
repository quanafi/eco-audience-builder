"""Facet metadata for the filter UI: the real segment values and base counts.

Fetched live from edw2.customers once and cached for the process lifetime so the
filter chips always reflect what is actually in the warehouse.
"""
from __future__ import annotations

from functools import lru_cache

from .audience_query import FLAGS, REGIONS, TRADES
from .db import run_query

# Segment columns whose distinct (non-null) values become filter chips.
_SEGMENT_FACETS = {
    "revenueSegments": "lifetime_revenue_segment",
    "frequencySegments": "frequency_segment",
    "recencySegments": "paid_recency_segment",
}


@lru_cache(maxsize=1)
def get_facets() -> dict:
    base = run_query("select count(*) as n from edw2.customers")[0]["n"]

    segments: dict[str, list[dict]] = {}
    for key, col in _SEGMENT_FACETS.items():
        rows = run_query(
            f"""select {col} as v, count(*) as n
                from edw2.customers
                where {col} is not null
                group by 1 order by 1"""
        )
        segments[key] = [{"value": r["v"], "count": int(r["n"])} for r in rows]

    # All job tags (one row per customer's distinct tag across their jobs). 605-ish
    # values, so this is browsed via a searchable/scrollable list in the UI, not chips.
    # Sorted by reach desc so the most common tags surface first.
    tag_rows = run_query(
        """select trim(t) as tag, count(distinct customer_id) as n
            from edw2.jobs
            cross join unnest(string_to_array(tags, ',')) as t
            where tags is not null and tags <> '' and trim(t) <> ''
            group by 1 order by 2 desc, 1"""
    )

    trade_counts = run_query(
        "select "
        + ", ".join(f"count(*) filter (where {c} = 1) as \"{name}\"" for name, c in TRADES.items())
        + " from edw2.customers"
    )[0]
    region_counts = run_query(
        "select "
        + ", ".join(f"count(*) filter (where {c} = 1) as \"{name}\"" for name, c in REGIONS.items())
        + " from edw2.customers"
    )[0]
    flag_counts = run_query(
        "select "
        + ", ".join(f"count(*) filter (where {expr}) as \"{name}\"" for name, expr in FLAGS.items())
        + " from edw2.customers"
    )[0]

    return {
        "baseCount": int(base or 0),
        "trades": [{"value": n, "count": int(trade_counts[n] or 0)} for n in TRADES],
        "regions": [{"value": n, "count": int(region_counts[n] or 0)} for n in REGIONS],
        "segments": segments,
        "flags": {n: int(flag_counts[n] or 0) for n in FLAGS},
        "tags": [{"value": r["tag"], "count": int(r["n"])} for r in tag_rows],
    }
