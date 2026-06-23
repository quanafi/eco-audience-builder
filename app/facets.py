"""Facet metadata for the filter UI: the real segment values and base counts.

Fetched live from edw2.customers once and cached for the process lifetime so the
filter chips always reflect what is actually in the warehouse.
"""
from __future__ import annotations

from functools import lru_cache

from .audience_query import REGIONS, TRADES
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

    return {
        "baseCount": int(base or 0),
        "trades": [{"value": n, "count": int(trade_counts[n] or 0)} for n in TRADES],
        "regions": [{"value": n, "count": int(region_counts[n] or 0)} for n in REGIONS],
        "segments": segments,
    }
