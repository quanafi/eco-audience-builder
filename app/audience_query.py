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


def build_filters(payload: dict) -> tuple[list[str], dict]:
    """Return (where_clauses, bind_params) from the filter payload."""
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
        where.append("days_since_last_job >= :rmin")
        params["rmin"] = int(rmin)
    if rmax is not None:
        where.append("days_since_last_job <= :rmax")
        params["rmax"] = int(rmax)

    zips = _clean_zips(payload.get("zips"))
    if zips:
        where.append(f"{ZIP_EXPR} = any(:zips)")
        params["zips"] = zips

    smin, smax = _num(payload.get("spendMin")), _num(payload.get("spendMax"))
    if smin is not None:
        where.append("lifetime_revenue >= :smin")
        params["smin"] = smin
    if smax is not None:
        where.append("lifetime_revenue <= :smax")
        params["smax"] = smax

    for key, col in SEGMENT_COLUMNS.items():
        vals = _as_list(payload.get(key))
        if vals:
            pname = key
            where.append(f"{col} = any(:{pname})")
            params[pname] = [str(v) for v in vals]

    for flag in _as_list(payload.get("flags")):
        if flag in FLAGS:
            where.append(FLAGS[flag])

    return where, params


def _where_sql(where: list[str]) -> str:
    return ("\nwhere " + "\n  and ".join(where)) if where else ""


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

    base = run_query(f"select count(*) as n from {TABLE}")[0]["n"]

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


def build_display_sql(payload: dict) -> str:
    """Render a copy-pasteable SELECT with literal (validated) values inlined.

    For display only — run_audience executes the parameterized form. Every value
    inlined here is drawn from an allow-list or coerced to a number / 5-digit ZIP,
    so it is safe to paste into Hex.
    """
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
