# Eco Audience Builder

A standalone web app that lets marketing build a customer audience of their
choosing from **all** Eco Plumbers customers, see it size in real time, preview
the matching customers, and copy the exact read-only SQL.

It queries the live warehouse table `edw2.customers` (one row per `customer_id`,
ServiceTitan-derived, ~325K customers). Every query is **SELECT-only**.

![Audience Builder](docs/screenshot.png)

## How it works

- **Frontend** (`static/`) — a single-page UI (vanilla JS, no build step). Filter
  chips are populated from live facet counts; any change re-runs the query.
- **Backend** (`app/`) — a small Flask app:
  - `GET /api/facets` — distinct segment values + base/trade/region counts.
  - `POST /api/audience` — builds a parameterized SELECT from the filter payload,
    returns audience size, reachability, avg lifetime value, the top 200 matches,
    and the generated SQL.
  - `POST /api/ads/estimate` / `POST /api/ads/send` — predict a Google Ads / Meta
    customer-match rate and (dry-run) push the audience. **Prototype**: PII is
    SHA-256 hashed into the exact payload each platform expects and logged, never
    uploaded, until creds are configured (`app/ads.py`, `ADS_DRY_RUN` defaults on).
  - `db.py` refuses anything that is not `SELECT`/`WITH`.
- **`skills/eco-edw-querying/`** — the warehouse semantics playbook (DBT layering,
  table map, time-column pitfalls) used to choose the right columns. The source of
  truth for what the filters mean.

### Filters → real columns

| Filter | `edw2.customers` column(s) |
| --- | --- |
| Trade | `plumbing_customer` / `hvac_customer` / `electric_customer` |
| Recency (last job) | `days_since_last_job` |
| Region | `is_columbus_customer` / `is_dayton_customer` / `is_cincinnati_customer` / `is_chillicothe_customer` |
| ZIP | parsed from free-text `address` (trailing 5-digit, ~99.5% coverage) |
| Lifetime spend | `lifetime_revenue` |
| Segments | `lifetime_revenue_segment`, `frequency_segment`, `paid_recency_segment` |
| Reachability | `email`, `phone_number`, `is_member`, `is_repeat_customer` |
| Do not contact | `do_not_mail`, `do_not_text_numbers`, `do_not_service` (suppress opted-out customers; no email opt-out exists in the source) |

Do-not-contact customers (`do_not_mail`, `do_not_text_numbers`, `do_not_service`) are
**always excluded** — filtered out of the snapshot at load, so they never appear in
any count, preview, export or ad audience. It is not a user-facing filter: this app
exists to contact people. (No email opt-out exists in the source.)

City/ZIP/state in the preview table are parsed out of `address` (`street , City, OH 43215`).

## Run locally

```bash
uv sync
cp .env.example .env          # then set DATABASE_URL (read-only warehouse connection)
uv run python -m app.server   # http://127.0.0.1:8000
```

## Deploy (container)

```bash
docker build -t eco-audience-builder .
docker run -p 8080:8080 -e DATABASE_URL="postgresql://…" eco-audience-builder
```

The image runs `gunicorn` and reads `DATABASE_URL` from the environment, so it drops
straight onto Cloud Run (provide the connection string as an env var / secret).
