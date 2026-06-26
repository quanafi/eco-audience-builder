"""Tests for the read-only guard in app.db._assert_read_only.

Pure (no engine/DB needed). The guard permits exactly one SELECT/WITH statement and
rejects writes, multi-statement payloads, and statements smuggled past a comment.
"""
from __future__ import annotations

import pytest

from app.db import _assert_read_only, _strip_comments


def _ok(sql: str) -> None:
    _assert_read_only(sql)  # must not raise


def _bad(sql: str) -> None:
    with pytest.raises(ValueError):
        _assert_read_only(sql)


# --- accepted -------------------------------------------------------------
def test_plain_select():
    _ok("select 1")


def test_with_cte():
    _ok("with x as (select 1) select * from x")


def test_case_insensitive():
    _ok("SELECT 1")
    _ok("SeLeCt 1")
    _ok("WITH x AS (select 1) SELECT * FROM x")


def test_leading_whitespace_and_blank_lines():
    _ok("\n\n   select 1")


def test_leading_line_comment():
    _ok("-- header comment\nselect customer_id from edw2.customers")


def test_block_comment_prefix():
    _ok("/* a banner */ select 1")


def test_comment_mentioning_write_keyword_is_fine():
    # The write word lives only in a comment, which is stripped before the head check.
    _ok("/* this does not delete anything */ select 1")


def test_single_trailing_semicolon_allowed():
    _ok("select 1;")
    _ok("select 1 ;\n")


# --- rejected -------------------------------------------------------------
@pytest.mark.parametrize("sql", [
    "insert into t values (1)",
    "update t set x = 1",
    "delete from t",
    "drop table t",
    "truncate t",
    "",
    "   \n  ",
])
def test_rejects_non_select(sql):
    _bad(sql)


def test_rejects_multi_statement():
    _bad("select 1; delete from t")


def test_rejects_write_after_select_with_trailing_semicolons():
    _bad("select * from edw2.customers; drop table edw2.customers;")


def test_rejects_write_hidden_after_block_comment():
    # "/* select */ delete ..." -> head becomes "delete" -> rejected.
    _bad("/* select */ delete from t")


def test_rejects_statement_hidden_after_line_comment():
    # The `--` comments out the rest of its line, but the `; delete` on the next line
    # still makes this two statements.
    _bad("select 1 -- ignore\n; delete from t")


# --- _strip_comments helper ----------------------------------------------
def test_strip_block_and_line_comments():
    assert "secret" not in _strip_comments("select 1 /* secret */ -- secret\nfrom t")
