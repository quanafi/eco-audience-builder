"""Facet metadata for the filter UI: the real segment values and base counts.

Derived from the in-memory snapshot (app/snapshot.py), so the filter chips reflect
exactly the data the snapshot filters against. Both the global facet totals and the
job-tag universe are simple aggregates over the snapshot's columns — no warehouse
round-trip, and no separate slow tag query.
"""
from __future__ import annotations


def get_facets() -> dict:
    """Global (unfiltered) facet totals for /api/facets."""
    from . import snapshot  # lazy: snapshot imports from audience_query
    return snapshot.get_snapshot().base_facets()


def get_tag_facets() -> list[dict]:
    """The job-tag universe: every tag with its distinct-customer reach, reach desc."""
    from . import snapshot
    return snapshot.get_snapshot().tag_facets()
