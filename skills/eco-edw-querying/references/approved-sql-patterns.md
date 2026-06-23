# Approved SQL Patterns

These are default patterns, not immutable rules. Adjust only when the user's question requires it.

## BU-level KPI reporting

Use `actuals_cube_jbu` for BU, location, trade, and company KPI reporting.

Default notes:

- keep the query at the intended grouping-set level
- do not casually exclude Installation when revenue is involved
- use inline period comparisons only when requested
- guard against mixed-grain duplication with rollup-aware filters

```sql
select
  report_date,
  servicetitan_business_unit_name,
  department_type,
  revenue,
  sold_job_count,
  new_opportunity_count,
  new_opportunity_sold_count,
  new_opp_conversion_pct,
  average_sale,
  recall_rate,
  lto_rate
from edw2.actuals_cube_jbu
where report_date between :start_date and :end_date
  and servicetitan_business_unit_name <> 'Total';
```

## Technician KPI drilldowns

Use `actuals_by_technician` first for technician KPI drilldowns because much of the performance logic is already embedded there.

```sql
select
  report_date,
  technician_id,
  technician_name,
  servicetitan_business_unit_name,
  department_type,
  opportunity_count,
  sold_job_count,
  revenue,
  sold_hours,
  hours_worked,
  recalls
from edw2.actuals_by_technician
where report_date between :start_date and :end_date;
```

If JBU reconciliation matters, move to `actuals_by_technician_jbu`.

## Completed jobs and revenue

Use `jobs` for completed-job analysis and job-level realized revenue.

```sql
select
  completed_on_est::date as completed_date,
  primary_technician_name,
  trade_line_type,
  business_unit,
  count(*) as total_jobs,
  sum(case when is_opportunity then 1 else 0 end) as opportunities,
  sum(case when is_converted then 1 else 0 end) as converted,
  sum(revenue) as revenue
from edw2.jobs
where completed_on_est::date between :start_date and :end_date
  and job_status not in ('Canceled', 'Hold')
  and job_type <> 'To-Do'
group by 1, 2, 3, 4;
```

## Sales item analysis

Use `estimate_items_sold` for sold item analysis.

Default notes:

- resolve the requested item to `item_cross_sale_group` first
- for estimate-side item analysis, filter to `item_type = 'Service'` unless the user explicitly wants materials too
- if the question asks for who sold the work, group by `sold_by_name` first
- only use installer attribution when the question is explicitly about installers or fulfillment
- for sump pump questions, use `item_cross_sale_group = 'Sump Pumps'`
- if comparing estimate items to invoice items, map estimate `Service` to invoice `Services`, `Material` to `Materials`, and `PriceModifier` to `Discount`

```sql
select
  sold_on_est::date as sold_date,
  sold_by_name,
  sold_by_business_unit,
  item_cross_sale_group,
  sum(item_total) as sold_sales,
  sum(item_quantity) as sold_quantity
from edw2.estimate_items_sold
where sold_on_est::date between :start_date and :end_date
  and item_type = 'Service'
  and item_cross_sale_group = :item_cross_sale_group
group by 1, 2, 3, 4;
```

For sales conversion, prefer the sales metric family such as `sales_sold_job_count / sales_opportunity_count` rather than service opportunity logic.

## Realized revenue item analysis

Use `invoice_items` for item-level realized revenue.

Default notes:

- resolve the requested item to `item_cross_sale_group` first
- filter to `item_type = 'Services'` unless the user explicitly wants materials too
- if the question asks for who sold the work, group by `sold_by_name` first
- only use installer attribution when the question is explicitly about installers or fulfillment

```sql
select
  completed_on_est::date as completed_date,
  sold_by_name,
  business_unit_name,
  item_cross_sale_group,
  sum(item_total) as revenue,
  sum(item_cost) as item_cost,
  sum(item_quantity) as quantity
from edw2.invoice_items
where completed_on_est::date between :start_date and :end_date
  and item_type = 'Services'
  and item_cross_sale_group = :item_cross_sale_group
group by 1, 2, 3, 4;
```

Do not present item-level gross profit from this table as a full service gross margin story unless the user explicitly wants invoice-item economics only.

## Price history

Use `pricebook_history` for historical list-price behavior.

```sql
select
  history_date,
  item_cross_sale_group,
  item_display_name,
  item_price,
  item_member_price,
  item_cost,
  price_difference,
  percentage_difference,
  price_changed
from edw2.pricebook_history
where history_date between :start_date and :end_date;
```

Filter by `item_cross_sale_group` first when possible, then fall back to `item_display_name`.

## Booking-rate caution

There is not yet a fully approved rolled-up booking-rate mart in EDW2.

Two provisional definitions are in use:

- booked over booked plus unbooked call outcomes from lower-level call typing
- leads booked over priority inbound calls

When the user asks for booking rate, do not present a single canonical definition without confirming which one they want.
