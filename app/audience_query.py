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
# "Do not contact" suppressions. These are an *always-on baseline exclusion*, not a
# user-selectable filter: this app exists to contact people, so anyone who opted out
# is removed from the universe everywhere (audience counts, preview, displayed SQL,
# export and ad audiences) and never surfaces in the UI. A customer is dropped if any
# predicate below is TRUE. The backing columns come from ServiceTitan via the mart:
#   do_not_mail       customer-level boolean (physical mail opt-out)
#   do_not_service    customer-level boolean ("do not service this customer")
#   do_not_text_numbers  comma-joined list of the customer's do-not-text phone
#                        numbers — non-empty means at least one number opted out.
# There is no email opt-out in the source data, so no do_not_email suppression.
# These columns may not be present in the live mart yet; callers gate on the set
# of columns that actually exist (see _suppress_keys / snapshot.available_suppress)
# so generated SQL never references a column the warehouse doesn't have.
SUPPRESS = {
    "do_not_mail": "do_not_mail is true",
    "do_not_text": "(do_not_text_numbers is not null and do_not_text_numbers <> '')",
    "do_not_service": "do_not_service is true",
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
    from .facets import get_tag_facets  # lazy: facets imports from this module

    return {o["value"] for o in get_tag_facets()}


def _clean_tags(raw) -> list[str]:
    return [t for t in _as_list(raw) if t in _valid_tags()]


def _sql_lit(v) -> str:
    """Render a validated value as an inline SQL literal for the display query."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return f"{v:g}"
    return "'" + str(v).replace("'", "''") + "'"


class _BindRenderer:
    """Emit filter values as named bind parameters — the form executed by run_query.

    One instance is shared across the include and exclude sets, so its monotonic
    counter guarantees param names never collide between them.
    """

    def __init__(self):
        self.params: dict = {}
        self._n = 0

    def _bind(self, value) -> str:
        self._n += 1
        name = f"p{self._n}"
        self.params[name] = value
        return name

    def compare(self, expr: str, op: str, value) -> str:
        return f"{expr} {op} :{self._bind(value)}"

    def membership(self, expr: str, values: list) -> str:
        return f"{expr} = any(:{self._bind(values)})"


class _LiteralRenderer:
    """Emit filter values as inlined, validated SQL literals — the copy-paste display
    query. Every value reaching it is allow-listed or coerced to a number / 5-digit
    ZIP, and strings are quote-escaped, so the rendered SQL is safe to paste."""

    def compare(self, expr: str, op: str, value) -> str:
        return f"{expr} {op} {_sql_lit(value)}"

    def membership(self, expr: str, values: list) -> str:
        return f"{expr} in ({', '.join(_sql_lit(v) for v in values)})"


def _filter_clauses(payload: dict, render) -> list[str]:
    """Return WHERE clauses for a single filter set, using `render` to emit values.

    `render` is a value-rendering strategy: _BindRenderer for the executed query,
    _LiteralRenderer for the display SQL. A single clause builder means the
    parameterized query and the displayed SQL can never drift apart.
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
        where.append(render.compare("days_since_last_job", ">=", int(rmin)))
    if rmax is not None:
        where.append(render.compare("days_since_last_job", "<=", int(rmax)))

    zips = _clean_zips(payload.get("zips"))
    if zips:
        where.append(render.membership(ZIP_EXPR, zips))

    smin, smax = _num(payload.get("spendMin")), _num(payload.get("spendMax"))
    if smin is not None:
        where.append(render.compare("lifetime_revenue", ">=", smin))
    if smax is not None:
        where.append(render.compare("lifetime_revenue", "<=", smax))

    for key, col in SEGMENT_COLUMNS.items():
        vals = _as_list(payload.get(key))
        if vals:
            where.append(render.membership(col, [str(v) for v in vals]))

    for flag in _as_list(payload.get("flags")):
        if flag in FLAGS:
            where.append(FLAGS[flag])

    # Job tags: keep customers who have *any* selected tag on *any* of their jobs.
    # Correlated EXISTS against edw2.jobs (tags is a comma-separated, sometimes
    # space-padded list per job). EXISTS lets Postgres use the customer_id index and
    # plan a hash (anti-)join, so both include and exclude (not exists) stay well
    # under the warehouse statement timeout — a NOT IN (subquery) anti-join does not.
    tags = _clean_tags(payload.get("tags"))
    if tags:
        membership = render.membership("trim(tg)", tags)
        where.append(
            f"exists (select 1 from {JOBS_TABLE} j "
            f"cross join unnest(string_to_array(j.tags, ',')) as tg "
            f"where j.customer_id = {TABLE}.customer_id and {membership})"
        )

    return where


def _suppress_keys(available) -> list[str]:
    """The always-on "do not contact" keys to exclude, in SUPPRESS order, limited to
    columns that exist in the live mart.

    Suppression is no longer user-selectable — every available channel is always
    excluded. `available` is the set of suppression keys whose backing columns are
    present (snapshot.available_suppress). `None` means "no live snapshot context"
    (the unit tests / direct callers that aren't gating on a snapshot) and emits
    nothing, so those callers stay payload-only; production callers always pass
    snapshot.available_suppress, making the exclusion always-on. Anything whose
    column the warehouse doesn't have is dropped so generated SQL never references it.
    """
    avail = set() if available is None else set(available)
    return [k for k in SUPPRESS if k in avail]


def _all_clauses(payload: dict, render, available=None) -> list[str]:
    """Include clauses AND-ed with each exclude clause negated, then the always-on
    "do not contact" suppressions.

    Include clauses are AND-ed. Each exclude clause is negated and AND-ed, so a
    customer is dropped if they match *any* exclude criterion. Suppressions are
    likewise negated and AND-ed (a customer is dropped if any available do-not-
    contact predicate is TRUE), regardless of the payload. Both sets share the one
    `render` instance (param names stay unique across them); suppressions are
    constant SQL, no params.
    """
    where = _filter_clauses(payload, render)
    where.extend(f"not ({clause})" for clause in _filter_clauses(payload.get("exclude") or {}, render))
    where.extend(f"not ({SUPPRESS[k]})" for k in _suppress_keys(available))
    return where


def build_filters(payload: dict, available=None) -> tuple[list[str], dict]:
    """Return (where_clauses, bind_params) for the include + exclude filter sets
    plus any available "do not contact" suppressions."""
    render = _BindRenderer()
    return _all_clauses(payload, render, available), render.params


def _where_sql(where: list[str]) -> str:
    return ("\nwhere " + "\n  and ".join(where)) if where else ""


def _fetch_preview_rows(ids: list[int]) -> list[dict]:
    """Fetch display detail for the given customer_ids and return them in `ids`
    order (most-recent-first, as chosen in-memory). One indexed lookup of ≤200
    ids — the only DB round-trip per audience query now that filtering, stats and
    facet counts are computed from the in-memory snapshot."""
    if not ids:
        return []
    sql = f"""select
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
from {TABLE}
where customer_id = any(:ids)"""
    by_id = {r["customer_id"]: r for r in run_query(sql, {"ids": ids})}
    return [_present_row(by_id[i]) for i in ids if i in by_id]


def run_audience(payload: dict) -> dict:
    """Stats + preview rows + facet counts for the given filters.

    Filtering, stats and facet counts come from the in-memory snapshot (no
    per-keystroke warehouse scans); only the ≤200 preview detail rows are fetched
    from the warehouse, by id. The displayed copy-paste SQL still comes from
    build_display_sql, so it stays an accurate description of the equivalent query.
    """
    from . import snapshot  # lazy: snapshot imports from this module

    snap = snapshot.get_snapshot()
    mask = snap.match_mask(payload)
    stats = snap.stats(mask)
    audience = stats["audienceCount"]

    rows = _fetch_preview_rows(snap.top_ids(mask, ROW_LIMIT))
    base = snap.n

    return {
        "audienceCount": audience,
        "reachCount": stats["reachCount"],
        "avgValue": stats["avgValue"],
        "totalValue": stats["totalValue"],
        "baseCount": int(base or 0),
        "pctBase": (audience / base * 100.0) if base else 0.0,
        "rows": rows,
        "sql": build_display_sql(payload, snap.available_suppress),
        "limited": audience > ROW_LIMIT,
        "facetCounts": snap.facet_counts(payload),
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


def build_display_sql(payload: dict, available=None) -> str:
    """Render a copy-pasteable SELECT with literal (validated) values inlined.

    For display only — run_audience executes the parameterized form (build_filters).
    Both share _all_clauses, so the displayed SQL always matches what actually ran;
    only the value rendering differs. `available` gates the suppression clauses to
    columns the live mart actually has.
    """
    where = _all_clauses(payload, _LiteralRenderer(), available)
    where_sql = _where_sql(where)
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
order by last_completed_job desc nulls last;"""
