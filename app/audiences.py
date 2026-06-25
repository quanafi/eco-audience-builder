"""Saved audiences — PROTOTYPE (mock) store.

An "audience" is fully described by the filter JSON the frontend already sends to
/api/audience (see static/app.js `payload()`): an include set + nested `exclude`
set + `mode`. We persist the *filter definition only* — reopening re-runs it live
against the current snapshot, so membership always reflects today's data.

TODO (post-migration): replace this in-memory list with Firestore — one document
per audience, `audiences/{autoId} = {name, filters, ownerEmail, createdAt,
updatedAt}`. `ownerEmail` comes from the auth layer (IAP/SSO verified email) and
scopes each user's list; it's also the seam for future sharing. Nothing here writes
to the read-only warehouse.
"""
from __future__ import annotations

import itertools


def _filters(*, mode="include", **include):
    """Build a complete filter payload (the shape `payload()` sends) from the
    include fields given, with empty defaults so saved samples round-trip cleanly
    through the frontend's applyPayload()."""
    base = {
        "trades": [], "regions": [],
        "recencyMin": None, "recencyMax": None,
        "zips": "", "spendMin": None, "spendMax": None,
        "revenueSegments": [], "frequencySegments": [], "recencySegments": [],
        "flags": [], "tags": [],
    }
    return {**base, **include, "exclude": dict(base), "mode": mode}


# Seeded sample audiences using real, valid filter values (trades, regions and
# flags mirror the allow-lists in audience_query.py) so "Load" works end-to-end in
# the prototype. Replaced by per-user Firestore documents after migration.
_SAMPLES = [
    {
        "id": "sample-lapsed-plumbing-columbus",
        "name": "Lapsed Plumbing — Columbus",
        "filters": _filters(trades=["Plumbing"], regions=["Columbus"],
                            recencyMin=365, recencyMax=1095, flags=["has_email"]),
        "createdAt": "2026-06-01T00:00:00Z",
    },
    {
        "id": "sample-highvalue-hvac-members",
        "name": "High-value HVAC members",
        "filters": _filters(trades=["HVAC"], spendMin=5000,
                            flags=["is_member", "has_email"]),
        "createdAt": "2026-06-10T00:00:00Z",
    },
    {
        "id": "sample-reachable-repeat",
        "name": "Reachable repeat customers",
        "filters": _filters(flags=["is_repeat_customer", "has_mobile"]),
        "createdAt": "2026-06-18T00:00:00Z",
    },
]

# In-memory store for the prototype. Resets on restart and is shared across all
# users (no identity yet). Firestore replaces this.
_AUDIENCES: list[dict] = [dict(a) for a in _SAMPLES]
_id_seq = itertools.count(1)


def list_audiences() -> list[dict]:
    """All saved audiences. TODO: scope by ownerEmail once auth exists."""
    return [dict(a) for a in _AUDIENCES]


def save_audience(name: str, filters: dict) -> dict:
    """Append a saved audience to the mock store and return the created record.

    TODO (post-migration): write to Firestore with a server timestamp and the
    authenticated ownerEmail instead of this in-memory append.
    """
    name = (name or "").strip() or "Untitled audience"
    record = {
        "id": f"local-{next(_id_seq)}",
        "name": name,
        "filters": filters or {},
        "createdAt": None,  # TODO: Firestore server timestamp
    }
    _AUDIENCES.append(record)
    return {
        "ok": True,
        "id": record["id"],
        "audience": record,
        "message": f"Saved '{name}' (placeholder — will persist to Firestore after migration).",
    }
