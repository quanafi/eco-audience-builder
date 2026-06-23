---
name: eco-edw-querying
description: Use when querying or drafting SQL for an Ecoplumbers-style DBT EDW. This skill helps choose the right warehouse tables, ask clarifying business questions, inspect DBT artifacts, and generate safer SQL with explicit semantic assumptions.
---

# Eco EDW Querying

Use this skill for data questions that need accurate SQL, careful table selection, and explicit handling of business semantics.

The skill is portable. It assumes only standard DBT artifacts and common model layers, not any absolute local paths.

## Default workflow

1. Start from compiled DBT artifacts if available:
   - `target/catalog.json` for actual relation columns
   - `target/manifest.json` for lineage and model metadata
2. Prefer analyst-facing layers in this order unless the user explicitly wants lower-level logic:
   - marts
   - metrics
   - realtime reporting tables
   - intermediate models
   - staging models
3. Before writing SQL, lock down:
   - business domain
   - row grain
   - time field
   - metric definition
   - attribution logic
   - inclusion and exclusion rules
   - aggregation level
4. If the prompt is ambiguous, ask targeted approval questions before finalizing SQL.

## Repo-agnostic rules

- Prefer compiled column metadata over guessing from SQL text.
- Prefer marts over staging for user-facing analysis.
- Default to `jobs` first for most business questions unless the user explicitly needs item-level, call-level, or membership snapshot detail.
- Treat metrics as business definitions, not generic words.
- Do not assume `completed`, `sold`, `paid`, `booked`, `opportunity`, `converted`, `recall`, `LTO`, and `member` mean the same thing.
- If a KPI already exists in a metrics table, prefer using that table over rebuilding it from lower-level facts.

## Common semantic pitfalls

- Time logic often changes the answer:
  - `created_on_est`
  - `completed_on_est`
  - `invoice_date`
  - `sold_on_est`
  - `opportunity_date_est`
  - `report_date`
  - `recent_payment_on`
- Grain often changes the answer:
  - `job_id`
  - `invoice_id`
  - `invoice_item_id`
  - `estimate_id`
  - `estimate_item_id`
  - `customer_id`
  - technician-day
  - BU-day
- Attribution often changes the answer:
  - primary technician
  - sold-by technician
  - LTO setter
  - split technicians
  - scheduler session
  - call-center source

## Approved defaults for this EDW

- Domain priority:
  - operations
  - sales
  - customers
  - memberships
  - call center
  - dispatch
  - HR
  - marketing
  - finance
  - technology
- Safe default marts:
  - `jobs`
  - `invoice_items`
  - `estimate_items`
  - supporting KPI cubes only when the question matches their grain
- Avoid niche marts unless the user clearly needs them.
- Revenue default:
  - use completed jobs
  - use `job_status = 'Completed'`
  - use `completed_on_est::date`
  - when building from item grain, `item_total` is revenue
  - for invoice item-level revenue analysis, filter to `item_type = 'Services'` unless the user explicitly wants materials or mixed invoice composition
- Sales default:
  - sales means quoted or sold work
  - default sales date is `sold_on_est`
  - fallback sales date is `opportunity_date_est`
  - for estimate item-level sales analysis, filter to `item_type = 'Service'` unless the user explicitly wants materials or mixed estimate composition
  - when the user names an item category, resolve `item_cross_sale_group` first and only fall back to raw item names when no approved grouping exists
  - for sump pump questions, explicitly use `item_cross_sale_group = 'Sump Pumps'`
  - when counting sold items, prefer `sum(item_quantity)` and explain if the result is row-count based instead
  - when comparing estimate and invoice item types, use this mapping: `Equipment -> Equipment`, `Material -> Materials`, `PriceModifier -> Discount`, `Service -> Services`
- Department logic:
  - Service and Maintenance usually sell and complete their own work
  - Sales and Install often split the sales and fulfillment lifecycle
  - do not collapse revenue and sales into one metric without stating the assumption
- Conversion default:
  - conversion is `converted / opportunities`
  - prefer existing KPI or blended definitions when available
  - Service uses revenue-oriented conversion logic
  - Sales uses sold-estimate logic
  - Install does not count toward conversion
- Time defaults:
  - bookings or leads: `created_on_est`
  - completed jobs or revenue: `completed_on_est`
  - sales: `sold_on_est`
  - invoice date is rarely the primary reporting date
- Status defaults:
  - exclude `Canceled` and `Hold` jobs from normal metrics
  - include recalls and warranty jobs in total jobs unless the user requests otherwise
  - recalls and warranty typically should not count as opportunities
- Membership defaults:
  - break out memberships only when explicitly requested
- Attribution defaults:
  - primary technician for most operations analysis
  - for item sales and item revenue questions involving people, default to `sold_by` first
  - only switch to installer attribution when the user explicitly asks about installers, installs, fulfillment, or production
  - if installer attribution is required, fall back to `primary_technician` or split-technician logic depending on the table grain and whether split credit is requested
  - `lto_set_by` when LTO analysis is the key question
- Split defaults:
  - raw metrics for most analysis
  - split-adjusted metrics for core performance reporting or credit-allocation disputes
- KPI cube defaults:
  - prefer `actuals_cube_jbu` and related JBU rollups when financial alignment matters
  - prefer `budget_cube` for budget comparisons
  - use lower marts when more detailed filtering is required
  - for technician drilldown, prefer technician-grain KPI tables or lower marts over high-level grouping-set cubes
  - start technician KPI drilldowns with `actuals_by_technician` or `actuals_by_technician_jbu` before rebuilding from `jobs`
- Membership history defaults:
  - start with `customer_memberships`
  - fall back to `int_memberships_aggregated_to_customer` when the mart does not expose enough detail
- Call-center defaults:
  - use `contact_center_calls` for aggregate performance metrics
  - use `leads` for attribution questions
  - booking-rate logic is incomplete in EDW2 and may require lower-level or provisional logic
- Optimization target:
  - prefer the most business-correct answer over the fastest answer
- Ambiguity handling:
  - provide multiple SQL variants when semantics are materially ambiguous
- Model selection:
  - marts first, but allow intermediate models when marts hide necessary logic
- Period comparisons:
  - if the user explicitly asks for vs LY, vs PP, or similar comparisons, build them inline in SQL
  - otherwise return the base time series and leave comparisons to BI

## Standard intake questions

Ask only the missing questions from [references/semantic-questions.md](references/semantic-questions.md).

At minimum, clarify:

- Which domain is this: operations, sales, customers, memberships, dispatch, call center, HR, marketing, finance, or technology?
- What should one row represent?
- Which date should drive the result?
- What counts as success, conversion, or revenue?
- Are canceled, recall, warranty, membership, office-sold, non-job, or financing records included?
- Do counts need to be raw or split-adjusted?

## Known core tables for this EDW

Use [references/core-entrypoints.md](references/core-entrypoints.md) for the curated table map.

High-value tables usually include:

- `jobs`
- `invoices_completed`
- `invoice_items`
- `customers`
- `customer_memberships`
- `estimate_items`
- `estimate_items_sold`
- `actuals_by_technician`
- `actuals_by_technician_jbu`
- `actuals_cube`
- `actuals_cube_jbu`
- `budget_cube`
- `contact_center_calls`
- `leads`
- `employees`
- `freshservice`
- `pipeline_log`

## Artifact inspection

Use [scripts/artifact_lookup.py](scripts/artifact_lookup.py) to inspect a model before reading large SQL files.

Suggested usage:

```bash
python skills/eco-edw-querying/scripts/artifact_lookup.py jobs
```

The script prints:

- model name
- compiled relation name
- schema
- columns
- immediate upstream dependencies

## SQL drafting pattern

When generating SQL:

1. Name the chosen table and why it fits.
2. State the assumed grain and time field.
3. Use explicit column lists unless the task is exploratory.
4. Keep exploratory queries scoped with a date filter or limit.
5. Add brief comments where business logic is fragile.
6. If there are multiple valid interpretations, provide separate variants for approval.
7. For grouping-set KPI tables, explain how the filters preserve the intended aggregation level.

## Escalate to model SQL when needed

Inspect model SQL or macros when the question touches:

- conversion definitions
- LTO logic
- recall attribution
- membership status over time
- lead attribution
- split-adjusted performance metrics
- JBU vs technician-BU KPI rollups

These are the areas most likely to be wrong if inferred casually.

## Approved metric defaults

- Average ticket:
  - generally `revenue / sold_job_count`
  - treat run rate separately
- Run rate:
  - revenue-oriented views: `revenue / opportunities`
  - sales-oriented views: `sales / sold_estimate_jobs`
  - when rolled up to locations, trades, or company totals, prefer revenue-based run rate using completed work
- Sold hour efficiency:
  - default to `sold_hours / hours_worked`
  - prefer existing KPI tables because hours worked requires downstream timekeeping joins
- Opportunity defaults:
  - Service and Maintenance: `opportunity_count`
  - Sales: `sales_opportunity_count`
  - Call center booking volume: `new_opportunity_count`
- Conversion defaults outside KPI cubes:
  - start with KPI tables when possible
  - service-style conversion from `jobs` should use converted over opportunities
  - sales-style conversion should use `sales_sold_job_count / sales_opportunity_count`
- Total jobs run:
  - include recalls and warranty jobs
  - exclude `job_type = 'To-Do'`
- Sales defaults:
  - calculate from estimates or estimate items
  - exclude non-job estimates unless explicitly requested
  - average sales ticket defaults to `estimate_sales / estimate_jobs_sold`
- LTO defaults:
  - core metrics are `lto_set_count` and set rate
  - `lto_sales_generated` is a key effectiveness metric and should often be included beside set counts
  - default LTO set rate is `lto_set_count / (opportunity_count + lto_set_count)`
- Marketing lead defaults:
  - use job creation via `created_on_est`
  - do not remove cancellations by default for marketing lead creation, because the lead was still generated
  - for campaign analysis, consider both leads created and revenue realized to show the funnel
- Costing defaults:
  - use `jobs` for job-level margin, burden, and costing
  - use `invoice_items` for invoiced revenue mix and item-level realized revenue
  - prefer `gross_margin` from `jobs` over recomputing ad hoc margin unless decomposition is explicitly required
- Org interpretation defaults:
  - prefer job business unit for higher-order group reporting
  - prefer technician attribution only when the analysis is truly technician-centric
- Status defaults:
  - normal metric filters use `job_status not in ('Canceled', 'Hold')`
  - use `job_status = 'Completed'` when the question is explicitly about completed work or realized revenue
- Department nuance:
  - Sewer Service and HVAC Service / Maintenance are more LTO-driven
  - Plumbing Service and Electrical Service are more revenue-driven
  - Sales is sales-driven
- Rollup safety:
  - never sum across grouping-set outputs without checking the intended grain
  - company-total and higher-order KPI queries should use explicit rollup-aware filters
