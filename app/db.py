"""Read-only Cloud SQL (Postgres) access for the Audience Builder.

A thin wrapper around a pooled SQLAlchemy engine that refuses anything that is
not a SELECT/WITH. The warehouse connection string comes from DATABASE_URL.
"""
from __future__ import annotations

import os
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy it into .env.")
    # Modest pool — this is an internal tool, not a high-traffic service.
    return create_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)


def _assert_read_only(sql: str) -> None:
    lines = [
        ln for ln in sql.splitlines()
        if ln.strip() and not ln.strip().startswith("--")
    ]
    head = "\n".join(lines).lstrip().lower()
    if not head.startswith(("select", "with")):
        raise ValueError("Only read-only SELECT/WITH queries are permitted.")


def run_query(sql: str, params: dict | None = None) -> list[dict]:
    _assert_read_only(sql)
    with get_engine().connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]
