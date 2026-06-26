"""In-memory columnar snapshot of the customer mart for fast, DB-free filtering.

Why this exists: every filter change used to fan out into several un-indexed
warehouse scans (stats + preview + one facet query per active group), and the
job-tag filter re-ran a full `edw2.jobs` unnest inside each of them — seconds per
keystroke. Instead we load every customer's *filterable* columns once (daily) into
NumPy arrays and precompute a tag -> customer inverted index, then evaluate filters,
stats and facet counts entirely in-memory (sub-millisecond), with zero per-keystroke
DB round-trips.

The match/stat/facet logic here mirrors the SQL semantics in
`audience_query._filter_clauses` exactly (including three-valued-logic for the
exclude set), so the in-memory result and the displayed copy-paste SQL agree. The
builders in audience_query (build_filters / build_display_sql) are kept as the
source of that SQL and remain the contract the unit tests pin.
"""
from __future__ import annotations

import re
import threading

import numpy as np

from .audience_query import (
    FLAGS,
    JOBS_TABLE,
    REGIONS,
    SEGMENT_COLUMNS,
    SUPPRESS,
    TABLE,
    TRADES,
    _as_list,
    _clean_zips,
    _num,
)
from .db import run_query

# Mart column each "do not contact" suppression key reads. do_not_text derives a
# boolean from the comma-joined do_not_text_numbers list (non-empty => opted out).
# These columns may not exist in the mart yet; from_warehouse probes for them and
# falls back to a constant so a pre-migration warehouse still loads.
#
# Suppression is an always-on baseline exclusion: opted-out customers are filtered
# out at load time (from_warehouse) so they never enter the snapshot — they don't
# appear in any count, preview, facet, export or ad audience. `available_suppress`
# is kept only to gate the generated SQL (display + export) to columns that exist.
_SUPPRESS_SOURCE = {
    "do_not_mail": "do_not_mail",
    "do_not_text": "do_not_text_numbers",
    "do_not_service": "do_not_service",
}

# Python port of audience_query.ZIP_EXPR: a trailing 5-digit ZIP, optional +4.
_ZIP_RE = re.compile(r"(\d{5})(?:-\d{4})?\s*$")

# Daily refresh; the data only changes once per upstream load.
REFRESH_SECONDS = 24 * 60 * 60

# Empty-string sentinel for missing string columns (ZIP, segments). The mart's
# segment columns are never literally '' (get_facets only ever sees non-null
# values), so '' unambiguously means "null / no value here".
_MISSING = ""


def _parse_zip(address) -> str:
    if not address:
        return _MISSING
    m = _ZIP_RE.search(address)
    return m.group(1) if m else _MISSING


class Snapshot:
    """A columnar, read-only view of every customer plus a tag inverted index.

    Construct via `Snapshot.from_warehouse()` in production, or `Snapshot.from_rows()`
    (no DB) in tests. All public query methods take/return plain Python values.
    """

    def __init__(
        self,
        customer_id: np.ndarray,
        trade_masks: dict[str, np.ndarray],
        region_masks: dict[str, np.ndarray],
        flag_masks: dict[str, np.ndarray],
        days: np.ndarray,
        revenue: np.ndarray,
        zips: np.ndarray,
        segments: dict[str, np.ndarray],
        tag_index: dict[str, np.ndarray],
        available_suppress: set[str] | None = None,
    ):
        self.customer_id = customer_id
        self.n = len(customer_id)
        self.trade_masks = trade_masks
        self.region_masks = region_masks
        self.flag_masks = flag_masks
        self.days = days
        self.revenue = revenue
        self.zips = zips
        self.segments = segments
        self.tag_index = tag_index
        # Opted-out customers are already filtered out at load (from_warehouse), so the
        # snapshot only holds contactable customers. `available_suppress` is the subset
        # of do-not-contact channels whose columns really exist in the mart — kept only
        # to gate the generated SQL (display + export) to columns that exist.
        self.available_suppress = available_suppress or set()
        self._all_true = np.ones(self.n, dtype=bool)
        # tag -> precomputed boolean membership column (built lazily, cached).
        self._tag_mask_cache: dict[str, np.ndarray] = {}

    # ----------------------------------------------------------------- builders
    @staticmethod
    def _mart_columns() -> set[str]:
        """Column names present in the customer mart, for probing optional columns."""
        schema, _, name = TABLE.partition(".")
        rows = run_query(
            "select column_name from information_schema.columns "
            "where table_schema = :schema and table_name = :name",
            {"schema": schema, "name": name},
        )
        return {r["column_name"] for r in rows}

    @staticmethod
    def _mart_columns() -> set[str]:
        """Column names present in the customer mart, for probing optional columns."""
        schema, _, name = TABLE.partition(".")
        rows = run_query(
            "select column_name from information_schema.columns "
            "where table_schema = :schema and table_name = :name",
            {"schema": schema, "name": name},
        )
        return {r["column_name"] for r in rows}

    @classmethod
    def from_warehouse(cls) -> "Snapshot":
        """Load the snapshot with two read-only queries (customers + job tags)."""
        present = cls._mart_columns()
        available_suppress = {k for k, col in _SUPPRESS_SOURCE.items() if col in present}
        # Per-key SQL expression, falling back to a constant when the backing column
        # isn't in the mart yet, so a pre-migration warehouse still loads. Each yields
        # a boolean: TRUE => the customer opted out of that channel.
        dnm = "do_not_mail is true" if "do_not_mail" in present else "false"
        dns = "do_not_service is true" if "do_not_service" in present else "false"
        dnt = (
            "(do_not_text_numbers is not null and do_not_text_numbers <> '')"
            if "do_not_text_numbers" in present else "false"
        )
        present = cls._mart_columns()
        available_suppress = {k for k, col in _SUPPRESS_SOURCE.items() if col in present}
        # Per-key SQL expression, falling back to a constant when the backing column
        # isn't in the mart yet, so a pre-migration warehouse still loads. Each yields
        # a boolean: TRUE => the customer opted out of that channel.
        dnm = "do_not_mail is true" if "do_not_mail" in present else "false"
        dns = "do_not_service is true" if "do_not_service" in present else "false"
        dnt = (
            "(do_not_text_numbers is not null and do_not_text_numbers <> '')"
            if "do_not_text_numbers" in present else "false"
        )
        rows = run_query(
            f"""select
                customer_id,
                coalesce(plumbing_customer, 0) as plumbing_customer,
                coalesce(hvac_customer, 0)     as hvac_customer,
                coalesce(electric_customer, 0) as electric_customer,
                coalesce(is_columbus_customer, 0)    as is_columbus_customer,
                coalesce(is_dayton_customer, 0)      as is_dayton_customer,
                coalesce(is_cincinnati_customer, 0)  as is_cincinnati_customer,
                coalesce(is_chillicothe_customer, 0) as is_chillicothe_customer,
                coalesce(is_member, 0)          as is_member,
                coalesce(is_repeat_customer, 0) as is_repeat_customer,
                days_since_last_job,
                lifetime_revenue,
                address,
                lifetime_revenue_segment,
                frequency_segment,
                paid_recency_segment,
                (email is not null and email <> '')               as has_email,
                (phone_number is not null and phone_number <> '') as has_mobile
            from {TABLE}
            where not ({dnm}) and not ({dns}) and not ({dnt})"""
        )

        n = len(rows)
        customer_id = np.empty(n, dtype=np.int64)
        cols_bool = {
            k: np.empty(n, dtype=bool)
            for k in (
                "plumbing_customer", "hvac_customer", "electric_customer",
                "is_columbus_customer", "is_dayton_customer",
                "is_cincinnati_customer", "is_chillicothe_customer",
                "is_member", "is_repeat_customer", "has_email", "has_mobile",
                "do_not_mail", "do_not_service", "do_not_text",
            )
        }
        days = np.empty(n, dtype=np.float64)
        revenue = np.empty(n, dtype=np.float64)
        zips = np.empty(n, dtype="<U5")
        seg_lists = {col: np.empty(n, dtype=object) for col in SEGMENT_COLUMNS.values()}

        id_to_row: dict[int, int] = {}
        for i, r in enumerate(rows):
            cid = int(r["customer_id"])
            customer_id[i] = cid
            id_to_row[cid] = i
            for k in cols_bool:
                cols_bool[k][i] = bool(r[k])
            d = r["days_since_last_job"]
            days[i] = np.nan if d is None else float(d)
            rev = r["lifetime_revenue"]
            revenue[i] = np.nan if rev is None else float(rev)
            zips[i] = _parse_zip(r["address"])
            for col in seg_lists:
                v = r[col]
                seg_lists[col][i] = _MISSING if v is None else str(v)

        trade_masks = {name: cols_bool[col] for name, col in TRADES.items()}
        region_masks = {name: cols_bool[col] for name, col in REGIONS.items()}
        flag_masks = cls._flag_masks_from(cols_bool)
        suppress_masks = cls._suppress_masks_from(cols_bool, n)
        segments = {gkey: seg_lists[col] for gkey, col in SEGMENT_COLUMNS.items()}

        tag_index = cls._load_tag_index(id_to_row, n)
        return cls(customer_id, trade_masks, region_masks, flag_masks, days,
                   revenue, zips, segments, tag_index, available_suppress)

    @staticmethod
    def _flag_masks_from(cols_bool: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
        """Map each FLAGS key to its boolean column (mirrors the SQL flag exprs)."""
        return {
            "has_email": cols_bool["has_email"],
            "has_mobile": cols_bool["has_mobile"],
            "is_member": cols_bool["is_member"],
            "is_repeat_customer": cols_bool["is_repeat_customer"],
        }

    @staticmethod
    def _suppress_masks_from(cols_bool: dict[str, np.ndarray], n: int) -> dict[str, np.ndarray]:
        """Map each SUPPRESS key to its boolean column (TRUE => opted out). A key
        whose column wasn't loaded (e.g. test rows without it) gets all-False, which
        makes the suppression a harmless no-op."""
        return {
            key: cols_bool.get(key, np.zeros(n, dtype=bool))
            for key in SUPPRESS
        }

    @staticmethod
    def _load_tag_index(id_to_row: dict[int, int], n: int) -> dict[str, np.ndarray]:
        """Build tag -> array-of-row-indices from the distinct (customer, tag) pairs.

        Same unnest as facets.get_tag_facets, but grouped to one row per
        (customer, tag) so each tag's index already holds distinct customers.
        """
        pairs = run_query(
            f"""select customer_id, trim(t) as tag
                from {JOBS_TABLE}
                cross join unnest(string_to_array(tags, ',')) as t
                where tags is not null and tags <> '' and trim(t) <> ''
                group by 1, 2"""
        )
        buckets: dict[str, list[int]] = {}
        for p in pairs:
            row = id_to_row.get(int(p["customer_id"]))
            if row is not None:  # ignore jobs whose customer isn't in the mart
                buckets.setdefault(p["tag"], []).append(row)
        return {tag: np.array(idx, dtype=np.int64) for tag, idx in buckets.items()}

    @classmethod
    def from_rows(cls, rows: list[dict], tag_rows: list[dict] | None = None) -> "Snapshot":
        """Build a snapshot from plain dicts (no DB) — for tests.

        `rows`: dicts with the same keys the warehouse query produces (flags as
        0/1 or bool, days_since_last_job / lifetime_revenue possibly None, address,
        the three segment columns, has_email / has_mobile, plus the optional
        do_not_mail / do_not_service / do_not_text opt-out flags). `tag_rows`: dicts
        with {customer_id, tag} (already distinct per pair).

        Mirrors from_warehouse: opted-out customers (any do_not_* flag set) are
        dropped up front, so the snapshot only holds contactable customers.
        """
        rows = [
            r for r in rows
            if not (r.get("do_not_mail") or r.get("do_not_service") or r.get("do_not_text"))
        ]
        n = len(rows)
        customer_id = np.array([int(r["customer_id"]) for r in rows], dtype=np.int64)

        def boolcol(key):
            return np.array([bool(r.get(key)) for r in rows], dtype=bool)

        cols_bool = {
            k: boolcol(k)
            for k in (
                "plumbing_customer", "hvac_customer", "electric_customer",
                "is_columbus_customer", "is_dayton_customer",
                "is_cincinnati_customer", "is_chillicothe_customer",
                "is_member", "is_repeat_customer", "has_email", "has_mobile",
                "do_not_mail", "do_not_service", "do_not_text",
            )
        }
        days = np.array(
            [np.nan if r.get("days_since_last_job") is None else float(r["days_since_last_job"]) for r in rows],
            dtype=np.float64,
        )
        revenue = np.array(
            [np.nan if r.get("lifetime_revenue") is None else float(r["lifetime_revenue"]) for r in rows],
            dtype=np.float64,
        )
        zips = np.array([_parse_zip(r.get("address")) for r in rows], dtype="<U5")
        segments: dict[str, np.ndarray] = {}
        for gkey, col in SEGMENT_COLUMNS.items():
            segments[gkey] = np.array(
                [_MISSING if r.get(col) is None else str(r[col]) for r in rows], dtype=object
            )

        id_to_row = {int(r["customer_id"]): i for i, r in enumerate(rows)}
        buckets: dict[str, list[int]] = {}
        for p in tag_rows or []:
            row = id_to_row.get(int(p["customer_id"]))
            if row is not None:
                buckets.setdefault(p["tag"], []).append(row)
        tag_index = {tag: np.array(idx, dtype=np.int64) for tag, idx in buckets.items()}

        trade_masks = {name: cols_bool[col] for name, col in TRADES.items()}
        region_masks = {name: cols_bool[col] for name, col in REGIONS.items()}
        flag_masks = cls._flag_masks_from(cols_bool)
        suppress_masks = cls._suppress_masks_from(cols_bool, n)
        return cls(customer_id, trade_masks, region_masks, flag_masks, days,
                   revenue, zips, segments, tag_index, set(_SUPPRESS_SOURCE))

    # --------------------------------------------------------------- filtering
    def _tag_mask(self, tag: str) -> np.ndarray:
        m = self._tag_mask_cache.get(tag)
        if m is None:
            m = np.zeros(self.n, dtype=bool)
            idx = self.tag_index.get(tag)
            if idx is not None:
                m[idx] = True
            self._tag_mask_cache[tag] = m
        return m

    def _clauses(self, fset: dict) -> list[tuple[np.ndarray, np.ndarray]]:
        """One (truth, known) pair per WHERE clause in `fset`, matching
        audience_query._filter_clauses. `truth` = predicate is TRUE; `known` =
        predicate is not NULL (only the nullable columns ever set this False)."""
        out: list[tuple[np.ndarray, np.ndarray]] = []
        true_all = self._all_true

        trades = [t for t in _as_list(fset.get("trades")) if t in TRADES]
        if trades:
            m = np.zeros(self.n, dtype=bool)
            for t in trades:
                m |= self.trade_masks[t]
            out.append((m, true_all))

        regions = [r for r in _as_list(fset.get("regions")) if r in REGIONS]
        if regions:
            m = np.zeros(self.n, dtype=bool)
            for r in regions:
                m |= self.region_masks[r]
            out.append((m, true_all))

        rmin, rmax = _num(fset.get("recencyMin")), _num(fset.get("recencyMax"))
        days_known = ~np.isnan(self.days)
        if rmin is not None:
            out.append((days_known & (self.days >= int(rmin)), days_known))
        if rmax is not None:
            out.append((days_known & (self.days <= int(rmax)), days_known))

        zips = _clean_zips(fset.get("zips"))
        if zips:
            zip_known = self.zips != _MISSING
            out.append((np.isin(self.zips, zips), zip_known))

        smin, smax = _num(fset.get("spendMin")), _num(fset.get("spendMax"))
        rev_known = ~np.isnan(self.revenue)
        if smin is not None:
            out.append((rev_known & (self.revenue >= smin), rev_known))
        if smax is not None:
            out.append((rev_known & (self.revenue <= smax), rev_known))

        for gkey in SEGMENT_COLUMNS:
            vals = _as_list(fset.get(gkey))
            if vals:
                arr = self.segments[gkey]
                seg_known = arr != _MISSING
                out.append((np.isin(arr, [str(v) for v in vals]), seg_known))

        for flag in _as_list(fset.get("flags")):
            if flag in FLAGS:
                out.append((self.flag_masks[flag], true_all))

        tags = [t for t in _as_list(fset.get("tags")) if t in self.tag_index]
        if tags:
            m = np.zeros(self.n, dtype=bool)
            for t in tags:
                m |= self._tag_mask(t)
            out.append((m, true_all))

        return out

    def match_mask(self, payload: dict) -> np.ndarray:
        """Boolean mask of customers matching include AND not-any-exclude.

        Include clauses keep a row only where the predicate is TRUE. Each exclude
        clause keeps a row only where the predicate is definitely FALSE (known &
        ~truth) — reproducing SQL `not (clause)`, where a NULL predicate drops the
        row just as `not null` is not TRUE.
        """
        mask = self._all_true.copy()
        for truth, _known in self._clauses(payload):
            mask &= truth
        for truth, known in self._clauses(payload.get("exclude") or {}):
            mask &= known & ~truth
        # Do-not-contact suppression is applied at load time (opted-out customers are
        # never in the snapshot), so there is nothing to mask here.
        return mask

    def stats(self, mask: np.ndarray) -> dict:
        audience = int(mask.sum())
        reach = int((mask & (self.flag_masks["has_email"] | self.flag_masks["has_mobile"])).sum())
        rev = self.revenue[mask]
        rev = rev[~np.isnan(rev)]  # SQL avg/sum ignore NULLs
        total = float(rev.sum()) if rev.size else 0.0
        avg = float(rev.mean()) if rev.size else 0.0
        return {"audienceCount": audience, "reachCount": reach, "avgValue": avg, "totalValue": total}

    def top_ids(self, mask: np.ndarray, limit: int) -> list[int]:
        """customer_ids of matched rows, most-recent first (days asc, nulls last),
        equivalent to `order by last_completed_job desc nulls last limit N`."""
        idx = np.flatnonzero(mask)
        if idx.size == 0:
            return []
        keys = np.where(np.isnan(self.days[idx]), np.inf, self.days[idx])
        order = idx[np.argsort(keys, kind="stable")][:limit]
        return [int(c) for c in self.customer_id[order]]

    def matched_ids(self, mask: np.ndarray) -> list[int]:
        """Every matched customer_id (uncapped) — for actions that operate on the
        whole audience, like the ServiceTitan tag write-back. Unlike top_ids this
        is not limited or ordered for preview."""
        return [int(c) for c in self.customer_id[mask]]

    def facet_counts(self, payload: dict) -> dict:
        """Per-option counts that ignore the option's own group but honor every
        other active filter — same behavior as the SQL facet_counts, computed as
        cheap masked counts. Tags are intentionally omitted (parity with the UI)."""
        mode = payload.get("mode") or "include"

        def base_mask_for(gkey: str) -> np.ndarray:
            if mode == "exclude":
                p = dict(payload)
                p["exclude"] = {k: v for k, v in (payload.get("exclude") or {}).items() if k != gkey}
            else:
                p = {k: v for k, v in payload.items() if k != gkey}
                p["exclude"] = payload.get("exclude") or {}
            return self.match_mask(p)

        out: dict[str, dict] = {}

        for gkey, masks in (("trades", self.trade_masks), ("regions", self.region_masks)):
            base = base_mask_for(gkey)
            out[gkey] = {name: int((base & m).sum()) for name, m in masks.items()}

        for gkey in SEGMENT_COLUMNS:
            base = base_mask_for(gkey)
            arr = self.segments[gkey]
            out[gkey] = {v: int((base & (arr == v)).sum()) for v in self._segment_values(gkey)}

        base = base_mask_for("flags")
        out["flags"] = {name: int((base & m).sum()) for name, m in self.flag_masks.items()}
        return out

    # ---------------------------------------------------------------- facets
    def _segment_values(self, gkey: str) -> list[str]:
        arr = self.segments[gkey]
        vals = np.unique(arr[arr != _MISSING])
        return [str(v) for v in vals]

    def base_facets(self) -> dict:
        """Global facet metadata (the unfiltered totals) for /api/facets."""
        segs: dict[str, list[dict]] = {}
        for gkey in SEGMENT_COLUMNS:
            arr = self.segments[gkey]
            vals, counts = np.unique(arr[arr != _MISSING], return_counts=True)
            segs[gkey] = [{"value": str(v), "count": int(c)} for v, c in zip(vals, counts)]
        return {
            "baseCount": self.n,
            "trades": [{"value": name, "count": int(m.sum())} for name, m in self.trade_masks.items()],
            "regions": [{"value": name, "count": int(m.sum())} for name, m in self.region_masks.items()],
            "segments": segs,
            "flags": {name: int(m.sum()) for name, m in self.flag_masks.items()},
            # Do-not-contact suppression is always-on: opted-out customers are filtered
            # out at load (from_warehouse / from_rows), so they're not in the snapshot
            # at all and suppression is not a user-facing facet.
        }

    def tag_facets(self) -> list[dict]:
        """The job-tag universe with each tag's distinct-customer reach, reach desc."""
        items = [{"value": tag, "count": int(idx.size)} for tag, idx in self.tag_index.items()]
        items.sort(key=lambda o: (-o["count"], o["value"]))
        return items


# --------------------------------------------------------------- process-wide state
_snapshot: Snapshot | None = None
_lock = threading.Lock()
_timer: threading.Timer | None = None


def get_snapshot() -> Snapshot:
    """Return the current snapshot, building it on first use (thread-safe)."""
    global _snapshot
    if _snapshot is None:
        with _lock:
            if _snapshot is None:
                _snapshot = Snapshot.from_warehouse()
    return _snapshot


def refresh() -> None:
    """Rebuild the snapshot and swap it in atomically (old one stays live until
    the new one is ready, so in-flight requests never see a partial snapshot)."""
    global _snapshot
    new = Snapshot.from_warehouse()
    _snapshot = new


def start_background_refresh(interval: float = REFRESH_SECONDS) -> None:
    """Build the snapshot now and schedule a daily rebuild. Best-effort: a failed
    build/refresh is swallowed so the web process still starts; the next request
    (or the next tick) retries."""
    global _timer

    def _tick():
        global _timer
        try:
            refresh()
        except Exception:
            pass
        _timer = threading.Timer(interval, _tick)
        _timer.daemon = True
        _timer.start()

    try:
        get_snapshot()
    except Exception:
        pass
    _timer = threading.Timer(interval, _tick)
    _timer.daemon = True
    _timer.start()
