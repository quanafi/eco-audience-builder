"""Read-only Cloud SQL (Postgres) access for the Audience Builder.

A thin wrapper around a pooled SQLAlchemy engine that refuses anything that is
not a SELECT/WITH. The warehouse connection string comes from DATABASE_URL.
"""
from __future__ import annotations

import os
import re
from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

# /* ... */ block comments (DOTALL so they can span lines).
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set. Copy it into .env.")
    # Modest pool — this is an internal tool, not a high-traffic service.
    return create_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)


def _strip_comments(sql: str) -> str:
    """Remove /* */ block comments and -- line comments.

    Our executed queries never contain `--` or `/* */` inside string literals, so
    stripping `--` to end-of-line (SQL comment semantics) is safe here and prevents a
    comment from hiding a second statement.
    """
    sql = _BLOCK_COMMENT.sub(" ", sql)
    out = []
    for ln in sql.splitlines():
        idx = ln.find("--")
        out.append(ln if idx == -1 else ln[:idx])
    return "\n".join(out)


def _assert_read_only(sql: str) -> None:
    """Permit exactly one SELECT/WITH statement; reject everything else.

    Guards against non-read statements, statements smuggled after a comment, and
    multi-statement payloads (`select 1; delete ...`) — psycopg2 will happily run
    every `;`-separated statement in one call.
    """
    cleaned = _strip_comments(sql)
    statements = [s for s in cleaned.split(";") if s.strip()]
    if len(statements) > 1:
        raise ValueError("Only a single read-only statement is permitted.")
    head = (statements[0] if statements else "").lstrip().lower()
    if not head.startswith(("select", "with")):
        raise ValueError("Only read-only SELECT/WITH queries are permitted.")


def run_query(sql: str, params: dict | None = None) -> list[dict]:
    _assert_read_only(sql)
    with get_engine().connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]


def stream_query(sql: str, params: dict | None = None) -> Iterator[dict]:
    """Yield rows one at a time without materializing the whole result set.

    For large exports (the full audience can be tens of thousands of rows). Uses
    a server-side cursor (stream_results) so memory stays bounded. Subject to the
    same SELECT/WITH-only guard as run_query.
    """
    _assert_read_only(sql)
    with get_engine().connect() as conn:
        result = conn.execution_options(stream_results=True).execute(text(sql), params or {})
        for row in result:
            yield dict(row._mapping)
