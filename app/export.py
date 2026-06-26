"""Full-audience export to CSV / Excel (.xlsx).

Reuses the include+exclude WHERE builder from audience_query, but selects only the
columns the caller asks for and applies no row limit (the export is the *whole*
matching audience, which can be tens of thousands of rows — hence streaming).

The customer_id column is rendered as a clickable link to the customer's
ServiceTitan profile: a =HYPERLINK() formula in CSV, a native cell hyperlink in
xlsx.
"""
from __future__ import annotations

import csv
import io
import os
from collections.abc import Iterator

from .audience_query import (
    CITY_EXPR,
    JOBS_TABLE,
    PRIMARY_TRADE_EXPR,
    STATE_EXPR,
    TABLE,
    ZIP_EXPR,
    build_filters,
    build_select,
    _where_sql,
)
from .db import stream_query

# Comma-joined list of a customer's distinct job tags. Correlated subquery, so it's
# opt-in (not in DEFAULT_COLUMNS) — one lookup per exported row.
JOB_TAGS_EXPR = (
    f"(select string_agg(distinct trim(tg), ', ') from {JOBS_TABLE} j "
    f"cross join unnest(string_to_array(j.tags, ',')) as tg "
    f"where j.customer_id = {TABLE}.customer_id and trim(tg) <> '')"
)

# Base URL for a customer's ServiceTitan profile. {id} is the customer_id.
ST_CUSTOMER_URL = os.environ.get("ST_CUSTOMER_URL", "https://go.servicetitan.com/#/customer/{id}")

# Allow-list of exportable columns: key -> (header, sql_expr, kind).
# Order here is the order columns appear in the file (customer_id first).
COLUMN_CATALOG: dict[str, tuple[str, str, str]] = {
    "customer_id":              ("Customer ID", "customer_id", "int"),
    "name":                     ("Name", "name", "str"),
    "email":                    ("Email", "email", "str"),
    "phone_number":             ("Phone", "phone_number", "str"),
    "city":                     ("City", CITY_EXPR, "str"),
    "state":                    ("State", STATE_EXPR, "str"),
    "zip":                      ("ZIP", ZIP_EXPR, "str"),
    "address":                  ("Address", "address", "str"),
    "primary_trade":            ("Primary trade", PRIMARY_TRADE_EXPR, "str"),
    "lifetime_jobs":            ("Lifetime jobs", "lifetime_jobs", "int"),
    "lifetime_revenue":         ("Lifetime revenue", "lifetime_revenue", "money"),
    "last_completed_job":       ("Last job date", "last_completed_job", "date"),
    "days_since_last_job":      ("Days since last job", "days_since_last_job", "int"),
    "lifetime_revenue_segment": ("Revenue segment", "lifetime_revenue_segment", "str"),
    "frequency_segment":        ("Frequency segment", "frequency_segment", "str"),
    "paid_recency_segment":     ("Recency segment", "paid_recency_segment", "str"),
    "job_tags":                 ("Job tags", JOB_TAGS_EXPR, "str"),
    "is_member":                ("EcoFi member", "is_member", "bool"),
    "is_repeat_customer":       ("Repeat customer", "is_repeat_customer", "bool"),
    "has_email":                ("Has email", "(email is not null and email <> '')", "bool"),
    "has_mobile":               ("Has mobile", "(phone_number is not null and phone_number <> '')", "bool"),
}

# Sensible default selection when the caller doesn't specify columns.
DEFAULT_COLUMNS = [
    "customer_id", "name", "email", "phone_number", "city", "state", "zip",
    "primary_trade", "lifetime_jobs", "lifetime_revenue", "last_completed_job",
]


def _st_url(customer_id) -> str:
    return ST_CUSTOMER_URL.format(id=customer_id)


# A text cell starting with one of these is interpreted as a formula by Excel/Google
# Sheets — e.g. a customer name of "=cmd|..." or "+HYPERLINK(...)" would execute on open.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value):
    """Neutralize spreadsheet formula injection by prefixing a risky leading character
    with a single quote. Non-string values (ints, money, "Yes"/"No") pass through."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def _resolve_columns(columns) -> list[str]:
    """Keep only known columns, ordered by the catalog (customer_id first)."""
    requested = set(columns or [])
    cols = [k for k in COLUMN_CATALOG if k in requested]
    return cols or list(DEFAULT_COLUMNS)


def _format(kind: str, value):
    """Coerce a raw DB value to a clean cell value (native types where it helps)."""
    if value is None:
        return ""
    if kind == "bool":
        return "Yes" if value else "No"
    if kind == "money":
        return round(float(value), 2)
    if kind == "int":
        return int(value)
    if kind == "date":
        return value.isoformat()[:10] if hasattr(value, "isoformat") else str(value)
    return value


def _build_query(columns: list[str], filters: dict) -> tuple[str, dict]:
    # Gate "do not contact" suppressions on the columns the live mart actually has,
    # using the same in-memory snapshot the rest of the app reads.
    from . import snapshot

    available = snapshot.get_snapshot().available_suppress
    where, params = build_filters(filters or {}, available)
    where_sql = _where_sql(where)
    select_list = ",\n    ".join(f"{COLUMN_CATALOG[c][1]} as {c}" for c in columns)
    sql = build_select(select_list, where_sql, order_by="customer_id asc")
    return sql, params


def stream_csv(columns, filters: dict) -> Iterator[str]:
    """Yield a CSV a chunk (row) at a time. customer_id is a =HYPERLINK formula."""
    columns = _resolve_columns(columns)
    sql, params = _build_query(columns, filters)

    buf = io.StringIO()
    writer = csv.writer(buf)

    def flush() -> str:
        chunk = buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        return chunk

    writer.writerow([COLUMN_CATALOG[c][0] for c in columns])
    yield flush()

    for row in stream_query(sql, params):
        out = []
        for c in columns:
            v = row.get(c)
            if c == "customer_id" and v is not None:
                out.append(f'=HYPERLINK("{_st_url(v)}","{v}")')
            else:
                out.append(_csv_safe(_format(COLUMN_CATALOG[c][2], v)))
        writer.writerow(out)
        yield flush()


def build_xlsx(columns, filters: dict) -> bytes:
    """Build an .xlsx workbook with customer_id as a native cell hyperlink.

    Uses openpyxl write_only mode so worksheet rows stream to a temp file rather
    than all living in memory at once.
    """
    from openpyxl import Workbook
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Font

    columns = _resolve_columns(columns)
    sql, params = _build_query(columns, filters)

    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Audience")
    link_font = Font(color="0563C1", underline="single")

    ws.append([COLUMN_CATALOG[c][0] for c in columns])
    for row in stream_query(sql, params):
        cells = []
        for c in columns:
            v = row.get(c)
            if c == "customer_id" and v is not None:
                cell = WriteOnlyCell(ws, value=v)
                cell.hyperlink = _st_url(v)
                cell.font = link_font
                cells.append(cell)
            else:
                cells.append(_csv_safe(_format(COLUMN_CATALOG[c][2], v)))
        ws.append(cells)

    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()
