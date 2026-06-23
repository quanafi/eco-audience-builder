"""Build read-only audience SQL against edw2.customers from a filter payload.

The live customer mart (edw2.customers, one row per customer_id) is the source of
truth — see skills/eco-edw-querying.

Notable shape differences handled here:
  * No city/zip columns — both are parsed out of the free-text `address`
    ('street , City, OH 43215'); ~99.5% of rows carry a trailing 5-digit ZIP.
  * Rich prebuilt segments (lifetime_revenue_segment, frequency_segment,
    paid_recency_segment) are exposed directly.
"""
from __future__ import annotations

import re

from .db import run_query

TABLE = "edw2.customers"
# One row per (job, ...) with a comma-separated `tags` column; joined back to
# customers by customer_id to filter on job tags. Same schema the app already reads.
JOBS_TABLE = "edw2.jobs"

# Allow-listed filter vocabularies. Used both to validate input and to render
# the inline (display) SQL safely — anything outside these sets is rejected.
TRADES = {
    "Plumbing": "plumbing_customer",
    "HVAC": "hvac_customer",
    "Electric": "electric_customer",
}
REGIONS = {
    "Columbus": "is_columbus_customer",
    "Dayton": "is_dayton_customer",
    "Cincinnati": "is_cincinnati_customer",
    "Chillicothe": "is_chillicothe_customer",
}
FLAGS = {
    "has_email": "(email is not null and email <> '')",
    "has_mobile": "(phone_number is not null and phone_number <> '')",
    "is_member": "is_member = 1",
    "is_repeat_customer": "is_repeat_customer = 1",
}
SEGMENT_COLUMNS = {
    "revenueSegments": "lifetime_revenue_segment",
    "frequencySegments": "frequency_segment",
    "recencySegments": "paid_recency_segment",
}

# SQL fragments parsed out of the free-text address.
ZIP_EXPR = r"substring(address from '(\d{5})(?:-\d{4})?\s*$')"
CITY_EXPR = r"substring(address from ',\s*([^,]+),\s*[A-Za-z]{2}\s+\d{5}')"
STATE_EXPR = r"substring(address from ',\s*([A-Za-z]{2})\s+\d{5}')"
PRIMARY_TRADE_EXPR = """case
        when greatest(coalesce(plumbing_jobs,0), coalesce(hvac_jobs,0), coalesce(electric_jobs,0)) = 0 then null
        when coalesce(plumbing_jobs,0) >= coalesce(hvac_jobs,0) and coalesce(plumbing_jobs,0) >= coalesce(electric_jobs,0) then 'Plumbing'
        when coalesce(hvac_jobs,0) >= coalesce(electric_jobs,0) then 'HVAC'
        else 'Electric'
    end"""

ROW_LIMIT = 200


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _clean_zips(raw) -> list[str]:
    """Accept a raw string or list; keep only valid 5-digit ZIPs."""
    if isinstance(raw, list):
        tokens = raw
    else:
        tokens = re.split(r"[\s,]+", str(raw or ""))
    return [t for t in (s.strip() for s in tokens) if re.fullmatch(r"\d{5}", t)]


def _valid_tags() -> set[str]:
    """The known job-tag vocabulary, used to reject anything not actually in the data."""
    from .facets import get_facets  # lazy: facets imports from this module

    return {o["value"] for o in get_facets().get("tags", [])}


def _clean_tags(raw) -> list[str]:
    return [t for t in _as_list(raw) if t in _valid_tags()]


def _filter_clauses(payload: dict, prefix: str = "") -> tuple[list[str], dict]:
    """Return (clauses, params) for a single filter set.

    `prefix` namespaces the bind-param names so the same builder can run twice
    (once for include, once for exclude) without param collisions.
    """
    where: list[str] = []
    params: dict = {}

    trades = [t for t in _as_list(payload.get("trades")) if t in TRADES]
    if trades:
        where.append("(" + " or ".join(f"{TRADES[t]} = 1" for t in trades) + ")")

    regions = [r for r in _as_list(payload.get("regions")) if r in REGIONS]
    if regions:
        where.append("(" + " or ".join(f"{REGIONS[r]} = 1" for r in regions) + ")")

    rmin, rmax = _num(payload.get("recencyMin")), _num(payload.get("recencyMax"))
    if rmin is not None:
        where.append(f"days_since_last_job >= :{prefix}rmin")
        params[f"{prefix}rmin"] = int(rmin)
    if rmax is not None:
        where.append(f"days_since_last_job <= :{prefix}rmax")
        params[f"{prefix}rmax"] = int(rmax)

    zips = _clean_zips(payload.get("zips"))
    if zips:
        where.append(f"{ZIP_EXPR} = any(:{prefix}zips)")
        params[f"{prefix}zips"] = zips

    smin, smax = _num(payload.get("spendMin")), _num(payload.get("spendMax"))
    if smin is not None:
        where.append(f"lifetime_revenue >= :{prefix}smin")
        params[f"{prefix}smin"] = smin
    if smax is not None:
        where.append(f"lifetime_revenue <= :{prefix}smax")
        params[f"{prefix}smax"] = smax

    for key, col in SEGMENT_COLUMNS.items():
        vals = _as_list(payload.get(key))
        if vals:
            pname = f"{prefix}{key}"
            where.append(f"{col} = any(:{pname})")
            params[pname] = [str(v) for v in vals]

    for flag in _as_list(payload.get("flags")):
        if flag in FLAGS:
            where.append(FLAGS[flag])

    # Job tags: keep customers who have *any* selected tag on *any* of their jobs.
    # Semi-join against edw2.jobs (tags is a comma-separated, sometimes space-padded
    # list per job). The `is not null` guard keeps NOT IN well-behaved for excludes.
    tags = _clean_tags(payload.get("tags"))
    if tags:
        pname = f"{prefix}tags"
        where.append(
            f"customer_id in (select j.customer_id from {JOBS_TABLE} j "
            f"cross join unnest(string_to_array(j.tags, ',')) as tg "
            f"where j.customer_id is not null and trim(tg) = any(:{pname}))"
        )
        params[pname] = tags

    return where, params


def build_filters(payload: dict) -> tuple[list[str], dict]:
    """Return (where_clauses, bind_params) for the include + exclude filter sets.

    Include clauses are AND-ed. Each exclude clause is negated and AND-ed, so a
    customer is dropped if they match *any* exclude criterion.
    """
    where, params = _filter_clauses(payload)

    ex_where, ex_params = _filter_clauses(payload.get("exclude") or {}, prefix="x_")
    where.extend(f"not ({clause})" for clause in ex_where)
    params.update(ex_params)

    return where, params


def _where_sql(where: list[str]) -> str:
    return ("\nwhere " + "\n  and ".join(where)) if where else ""


def facet_counts(payload: dict) -> dict:
    """Per-option customer counts that reflect the *current* selection.

    Standard faceted-search behavior: each facet group's counts are computed
    against every other active filter but ignore that group's own selection — so
    selecting "Electric" updates the Region counts to electric-customers-per-region,
    while the Trade counts still show each trade's total within the rest of the
    audience. `mode` says which set (include/exclude) the sidebar is editing.

    Returns {group: {option_value: count}}. Queries are de-duplicated by base
    filter, so an unfiltered view is a single query and each additional actively
    filtered group adds at most one more.
    """
    from .facets import get_facets  # lazy: facets imports from this module

    mode = payload.get("mode") or "include"
    gf = get_facets()
    seg_facets = gf.get("segments", {})

    # Cached global totals — used verbatim for any facet group with no *other* active
    # filter (its base WHERE is empty), so the common unfiltered view needs zero queries.
    globals_map: dict[str, dict] = {
        "trades": {o["value"]: o["count"] for o in gf.get("trades", [])},
        "regions": {o["value"]: o["count"] for o in gf.get("regions", [])},
        "flags": dict(gf.get("flags", {})),
    }
    for gkey in SEGMENT_COLUMNS:
        globals_map[gkey] = {o["value"]: o["count"] for o in seg_facets.get(gkey, [])}

    # group key -> list of (option_value, static_condition_or_None, segment_(col,value)_or_None)
    spec: list[tuple[str, list]] = []
    spec.append(("trades", [(v, f"{col} = 1", None) for v, col in TRADES.items()]))
    spec.append(("regions", [(v, f"{col} = 1", None) for v, col in REGIONS.items()]))
    for gkey, col in SEGMENT_COLUMNS.items():
        spec.append((gkey, [(o["value"], None, (col, o["value"])) for o in seg_facets.get(gkey, [])]))
    spec.append(("flags", [(v, expr, None) for v, expr in FLAGS.items()]))

    def base_for(gkey: str) -> tuple[list[str], dict]:
        """build_filters for the full selection minus this group's own selection."""
        if mode == "exclude":
            p = dict(payload)
            ex = {k: v for k, v in (payload.get("exclude") or {}).items() if k != gkey}
            p["exclude"] = ex
        else:
            p = {k: v for k, v in payload.items() if k != gkey}
            p["exclude"] = payload.get("exclude") or {}
        return build_filters(p)

    # Bucket facet groups that share an identical base so they run in one query.
    buckets: dict[tuple, dict] = {}
    for gkey, opts in spec:
        if not opts:
            continue
        where, params = base_for(gkey)
        bucket = buckets.setdefault(tuple(where), {"where": where, "params": dict(params), "groups": []})
        bucket["groups"].append((gkey, opts))

    out: dict[str, dict] = {}
    for gi_base, bucket in enumerate(buckets.values()):
        # Empty base => counts are the global totals; serve from cache, skip the query.
        if not bucket["where"]:
            for gkey, opts in bucket["groups"]:
                gmap = globals_map.get(gkey, {})
                out[gkey] = {value: gmap.get(value, 0) for value, _, _ in opts}
            continue
        selects: list[str] = []
        params = dict(bucket["params"])
        alias_map: list[tuple[str, str, object]] = []
        for gi, (gkey, opts) in enumerate(bucket["groups"]):
            for oi, (value, cond, seg) in enumerate(opts):
                if seg is not None:
                    col, segval = seg
                    pname = f"fcp_{gi_base}_{gi}_{oi}"
                    params[pname] = segval
                    cond_sql = f"{col} = :{pname}"
                else:
                    cond_sql = cond
                alias = f"fc_{gi_base}_{gi}_{oi}"
                selects.append(f"count(*) filter (where {cond_sql}) as {alias}")
                alias_map.append((alias, gkey, value))
        sql = "select\n  " + ",\n  ".join(selects) + f"\nfrom {TABLE}{_where_sql(bucket['where'])}"
        row = run_query(sql, params)[0]
        for alias, gkey, value in alias_map:
            out.setdefault(gkey, {})[value] = int(row[alias] or 0)

    # Tags (605+ options) are served as static global reach counts rather than
    # recomputed per selection — recomputing all of them on every query would be
    # too expensive. The UI uses these as a stable reach hint in the tag list.
    out["tags"] = {o["value"]: o["count"] for o in gf.get("tags", [])}
    return out


def run_audience(payload: dict) -> dict:
    """Execute stats + preview rows for the given filters and return a result dict."""
    where, params = build_filters(payload)
    where_sql = _where_sql(where)

    stats_sql = f"""select
    count(*)                                                          as audience_count,
    count(*) filter (where (email is not null and email <> '')
                        or (phone_number is not null and phone_number <> '')) as reachable_count,
    coalesce(avg(lifetime_revenue), 0)                               as avg_value,
    coalesce(sum(lifetime_revenue), 0)                               as total_value
from {TABLE}{where_sql}"""
    stats = run_query(stats_sql, params)[0]

    from .facets import get_facets  # cached; base customer count never changes in-process
    base = get_facets()["baseCount"]

    rows_sql = f"""select
    customer_id,
    name,
    {CITY_EXPR}            as city,
    {ZIP_EXPR}             as zip,
    {STATE_EXPR}           as state,
    {PRIMARY_TRADE_EXPR}   as primary_trade,
    lifetime_jobs,
    lifetime_revenue,
    last_completed_job,
    days_since_last_job,
    lifetime_revenue_segment,
    is_member,
    (email is not null and email <> '')        as has_email,
    (phone_number is not null and phone_number <> '') as has_mobile,
    is_repeat_customer
from {TABLE}{where_sql}
order by lifetime_revenue desc nulls last
limit {ROW_LIMIT}"""
    rows = run_query(rows_sql, params)

    audience = int(stats["audience_count"] or 0)
    return {
        "audienceCount": audience,
        "reachCount": int(stats["reachable_count"] or 0),
        "avgValue": float(stats["avg_value"] or 0),
        "totalValue": float(stats["total_value"] or 0),
        "baseCount": int(base or 0),
        "pctBase": (audience / base * 100.0) if base else 0.0,
        "rows": [_present_row(r) for r in rows],
        "sql": build_display_sql(payload),
        "limited": audience > ROW_LIMIT,
        "facetCounts": facet_counts(payload),
    }


def _present_row(r: dict) -> dict:
    return {
        "customer_id": r["customer_id"],
        "name": (r["name"] or "").strip() or f"Customer #{r['customer_id']}",
        "city": (r.get("city") or "").strip(),
        "zip": r.get("zip") or "",
        "state": (r.get("state") or "").strip(),
        "primary_trade": r.get("primary_trade") or "—",
        "lifetime_jobs": int(r["lifetime_jobs"] or 0),
        "lifetime_revenue": float(r["lifetime_revenue"] or 0),
        "last_completed_job": r["last_completed_job"].isoformat() if r.get("last_completed_job") else None,
        "days_since_last_job": r["days_since_last_job"],
        "segment": r.get("lifetime_revenue_segment") or "",
        "is_member": bool(r.get("is_member")),
        "has_email": bool(r.get("has_email")),
        "has_mobile": bool(r.get("has_mobile")),
        "is_repeat_customer": bool(r.get("is_repeat_customer")),
    }


def _sql_str(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def _literal_clauses(payload: dict) -> list[str]:
    """Build WHERE clauses for one filter set with literal (validated) values inlined."""
    where: list[str] = []

    trades = [t for t in _as_list(payload.get("trades")) if t in TRADES]
    if trades:
        where.append("(" + " or ".join(f"{TRADES[t]} = 1" for t in trades) + ")")
    regions = [r for r in _as_list(payload.get("regions")) if r in REGIONS]
    if regions:
        where.append("(" + " or ".join(f"{REGIONS[r]} = 1" for r in regions) + ")")
    rmin, rmax = _num(payload.get("recencyMin")), _num(payload.get("recencyMax"))
    if rmin is not None:
        where.append(f"days_since_last_job >= {int(rmin)}")
    if rmax is not None:
        where.append(f"days_since_last_job <= {int(rmax)}")
    zips = _clean_zips(payload.get("zips"))
    if zips:
        where.append(f"{ZIP_EXPR} in ({', '.join(_sql_str(z) for z in zips)})")
    smin, smax = _num(payload.get("spendMin")), _num(payload.get("spendMax"))
    if smin is not None:
        where.append(f"lifetime_revenue >= {smin:g}")
    if smax is not None:
        where.append(f"lifetime_revenue <= {smax:g}")
    for key, col in SEGMENT_COLUMNS.items():
        vals = _as_list(payload.get(key))
        if vals:
            where.append(f"{col} in ({', '.join(_sql_str(v) for v in vals)})")
    for flag in _as_list(payload.get("flags")):
        if flag in FLAGS:
            where.append(FLAGS[flag])

    tags = _clean_tags(payload.get("tags"))
    if tags:
        vals = ", ".join(_sql_str(t) for t in tags)
        where.append(
            f"customer_id in (select j.customer_id from {JOBS_TABLE} j "
            f"cross join unnest(string_to_array(j.tags, ',')) as tg "
            f"where j.customer_id is not null and trim(tg) in ({vals}))"
        )

    return where


def build_display_sql(payload: dict) -> str:
    """Render a copy-pasteable SELECT with literal (validated) values inlined.

    For display only — run_audience executes the parameterized form. Every value
    inlined here is drawn from an allow-list or coerced to a number / 5-digit ZIP,
    so it is safe to paste into Hex.
    """
    where = _literal_clauses(payload)
    where.extend(f"not ({clause})" for clause in _literal_clauses(payload.get("exclude") or {}))

    where_sql = ("\nwhere " + "\n  and ".join(where)) if where else ""
    return f"""-- Audience Builder · read-only segment query
-- source mart: {TABLE}  (one row per customer_id, ServiceTitan-derived)
select
    customer_id,
    name,
    {CITY_EXPR} as city,
    {ZIP_EXPR} as zip,
    {PRIMARY_TRADE_EXPR.strip()} as primary_trade,
    lifetime_jobs,
    lifetime_revenue,
    last_completed_job,
    days_since_last_job,
    lifetime_revenue_segment,
    is_member,
    is_repeat_customer
from {TABLE}{where_sql}
order by lifetime_revenue desc nulls last;"""
