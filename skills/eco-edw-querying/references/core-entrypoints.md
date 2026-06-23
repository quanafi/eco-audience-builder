# Core Entrypoints

Use these tables first when answering business questions.

## Operations

- `jobs`
  - Grain: one row per `job_id`
  - Good for: job counts, conversion context, technician attribution, customer history, campaign slicing, membership flags, LTO context, recall context
  - Important dates: `created_on_est`, `completed_on_est`, `modified_on_est`
  - Warning: verify definitions for `new_opportunity`, conversion, recall, and LTO before using them in KPI logic

- `invoices_completed`
  - Grain: one row per `invoice_id`
  - Good for: completed invoice totals, costs, discounts, payment mix, burden cost, purchase order rollups
  - Important dates: `invoice_date`, `completed_on_est`, `recent_payment_on`

- `invoice_items`
  - Grain: one row per invoice item
  - Good for: item-level revenue, sold hours, item mix, pricebook analysis
  - Default item logic: resolve requested categories with `item_cross_sale_group` first, filter to invoice-side `item_type = 'Services'` unless materials are explicitly requested, and use `sold_by` attribution before installer attribution for people-based item questions

- `care_plans`
  - Grain: care-plan opportunity row
  - Good for: care plan opportunities and sold care plans
  - Warning: clarify whether the user wants eligible opportunities, sold plans, or distinct plans

- `recalls`
  - Grain: recall-caused to recall-run relationship
  - Good for: recall attribution and technician impact

## Customers and memberships

- `customers`
  - Grain: one row per `customer_id`
  - Good for: tenure, repeat behavior, lifetime revenue, segmentation, equipment context

- `customer_memberships`
  - Grain: one row per `customer_id` per `as_of_date`
  - Good for: active member counts, churn windows, new-member windows, reacquisition
  - Warning: this is an as-of snapshot, not a single-row current-state dimension

## Sales

- `estimate_items`
  - Grain: one row per `estimate_item_id`
  - Good for: item-level estimates, quote value, office-sold vs field-sold, item mix
  - Important dates: `opportunity_date_est`, `sold_on_est`, `modified_on_est`, `completed_on_est`

- `estimate_items_sold`
  - Grain: one row per sold estimate item
  - Good for: sold item analysis and conversion detail
  - Default item logic: resolve requested categories with `item_cross_sale_group` first, filter to estimate-side `item_type = 'Service'` unless materials are explicitly requested, and use `sold_by` attribution before installer attribution for people-based item questions
  - Cross-table note: estimate item types do not exactly match invoice item types; use `Equipment -> Equipment`, `Material -> Materials`, `PriceModifier -> Discount`, `Service -> Services` when reconciling between the two

## Performance metrics

- `actuals_by_technician`
  - Grain: one row per technician per `report_date`
  - Good for: technician-day KPI analysis
  - Includes: opportunities, sold jobs, revenue, sold hours, recalls, worked hours, item-family metrics, LTO, estimate metrics
  - Warning: some metrics are split-adjusted and some are not
  - Default use: first choice for technician KPI drilldowns

- `actuals_cube`
  - Grain: aggregated daily grouping set
  - Good for: dashboard-style daily reporting by region, location, trade line type, department type, BU, team, or technician
  - Warning: totals use grouping sets and rollup values

- `actuals_cube_jbu`
  - Grain: aggregated daily grouping set at job-business-unit logic
  - Good for: finance-aligned KPI reporting where job BU matters more than technician BU
  - Prefer this over technician-BU cube variants when reconciling to financial reporting
  - Warning: because this is a composite KPI table, filters must preserve the intended rollup grain and avoid duplicate counting

- `actuals_by_technician_jbu`
  - Grain: one row per technician per `report_date` with job-BU-oriented KPI logic
  - Good for: technician drilldowns when the KPI family should still align to JBU reporting conventions
  - Warning: validate whether the user wants technician-level attribution or higher-order financial grouping before using this table
  - Default use: preferred fallback when technician reporting should still reconcile to JBU conventions

- `budget_cube`
  - Grain: daily budget reporting grain
  - Good for: targets and budget comparisons

## Call center

- `contact_center_calls`
  - Grain: aggregated call metrics by date and routing dimensions
  - Good for: presented, accepted, abandoned, SLA, duration, queue metrics, CSR-level call-center reporting
  - Warning: this is not the canonical booking-rate source

- `leads`
  - Grain: attributed lead interaction or job-linked lead record
  - Good for: connecting scheduler sessions, calls, and job outcomes
  - Warning: attribution priority is embedded in the model logic

## HR and technology

- `employees`
  - Grain: employee roster row
  - Good for: org structure, tenure, manager, contact, status

- `freshservice`
  - Grain: ticket row
  - Good for: IT support reporting

- `pipeline_log`
  - Grain: log event
  - Good for: pipeline monitoring and error review

- `pricebook_history`
  - Grain: item by `history_date`
  - Good for: item price changes over time, member vs standard price movement, and price-change monitoring
  - Warning: use this for historical list-price behavior, not default realized margin calculations

## Recommended source by question type

- KPI reporting by BU, location, trade, or company:
  - start with `actuals_cube_jbu`
- KPI reporting by technician:
  - start with `actuals_by_technician`
  - use `actuals_by_technician_jbu` when reconciliation to JBU conventions matters
- Sales item mix:
  - start with `estimate_items_sold`
- Realized revenue item mix:
  - start with `invoice_items`
- Job costing and gross margin:
  - start with `jobs`
- Marketing lead creation:
  - start with `jobs` on `created_on_est`
- Booking rate:
  - no fully approved rolled-up mart yet
  - use caution and document the provisional definition
- Price history:
  - start with `pricebook_history`

## Filtering hints for KPI cubes

- Always align filters to the intended rollup grain.
- Avoid mixing multiple non-total hierarchy levels unless the query is explicitly designed for that.
- For BU/day reporting, keep the BU columns at their specific values and let unrelated grouping-set columns stay at their rollup values where appropriate.
- When in doubt, test for rollup rows explicitly and document the assumption.

## When to go lower than marts

Drop to intermediate or staging only when:

- the user needs lineage or source-of-truth validation
- the mart is too aggregated
- a derived flag is missing or unclear
- you need to inspect how a KPI was constructed
