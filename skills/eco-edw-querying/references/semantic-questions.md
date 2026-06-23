# Semantic Questions

Use these questions to pressure-test a request before approving SQL.

## Universal questions

1. What decision or business question is this query supposed to support?
2. What should one row represent?
3. Which date field should drive the result?
4. What date range should apply?
5. Do you want raw facts or a pre-aggregated KPI table?
6. Is the priority speed, exact business logic, or a lineage-explained answer?
7. Do you want period comparisons like vs LY or vs PP built into the SQL?

## Operations and revenue

1. Are we analyzing jobs, invoices, invoice items, or customers?
2. Do you mean booked, completed, sold, paid, or all records?
3. Should canceled and hold jobs be excluded?
4. Are recall and warranty jobs included or excluded?
5. Should membership jobs be broken out?
6. If you say revenue, do you mean invoice total, item total, applied payment amount, or estimate sales?
7. Should counts be split-adjusted or raw?
8. Which technician attribution should be used: primary, sold-by, LTO setter, or split?
9. Which org slice matters: BU, department, branch, location, trade line type, or department type?
10. Should `job_type = 'To-Do'` be excluded from total jobs?

## Sales and estimates

1. Should the query use all estimate items or sold estimate items only?
2. Is the business date `sold_on_est`, `completed_on_est`, or `opportunity_date_est`?
3. Should office-sold estimates be included?
4. Should non-job estimates be included?
5. Is the target metric quote value, sold value, quantity, sold hours, or conversion?
6. Should attribution follow the job BU or the sold-by BU?
7. Do you want estimate count, estimate item count, job count, or distinct customer count?
8. Should non-job estimates be excluded?
9. Should item matching use `item_cross_sale_group` first and only fall back to raw item names if no approved grouping exists?
10. Is this an estimate-side or invoice-side item query, and are you using the correct `item_type` values for that table (`Service` vs `Services`, `Material` vs `Materials`, `PriceModifier` vs `Discount`)?
11. Should item-level results exclude materials by default using estimate-side `item_type = 'Service'` or invoice-side `item_type = 'Services'`?
12. If people are involved, should attribution default to `sold_by`, or is this explicitly an installer / fulfillment question?

## Customers and memberships

1. Do you want current members, members as of a historical date, or anyone who ever had a membership?
2. Should churn and new-member logic use 7, 30, 90, YTD, or 365-day windows?
3. Should customer lifetime metrics use booked, completed, or paid jobs?
4. Is `customer_id` sufficient for deduping?
5. Does equipment status belong in scope?

## Call center and attribution

1. Are you asking about calls, leads, booked leads, or converted leads?
2. Should attribution prioritize scheduler sessions, Zoom contact center calls, RingCentral calls, or jobs?
3. Do you want only inbound priority-route interactions?
4. How should abandoned, short-abandoned, callback, and deflected calls be treated?
5. Should the result be at interaction, day, CSR, route, or job grain?
6. Is this a call-center performance question or a booking-rate / conversion question?
7. If this is booking rate, should it use booked over booked plus unbooked call types, or leads booked over priority inbound calls?

## Approval prompts

Use prompts like these when needed:

- Approve or deny: "Use `jobs` at `job_id` grain, filter on `completed_on_est`, exclude canceled and hold jobs, and treat `new_opportunity` plus conversion flags as the conversion definition."
- Approve or deny: "Use `jobs` on `created_on_est` and keep cancellations included, because the question is about marketing-driven lead creation rather than realized operations outcomes."
- Approve or deny: "Use `actuals_cube_jbu` instead of rebuilding KPIs from `jobs`, because the request is daily operational reporting aligned to job business unit."
- Approve or deny: "Use `actuals_by_technician` first for technician KPI drilldowns, because much of the embedded logic is already standardized there."
- Approve or deny: "Use `estimate_items_sold` with `opportunity_date_est` as the reporting date and attribute results to `sold_by_id`, not the primary technician."
- Approve or deny: "Use `customer_memberships` as an as-of snapshot keyed by `as_of_date`, not `customers`, because the request is about churn or active members over time."
- Approve or deny: "Use `contact_center_calls` for SLA and abandonment instead of rebuilding call metrics from lower-level call logs."
