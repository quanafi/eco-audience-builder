/**
 * Static UI filter vocabulary (ported from static/app.js). The flag/segment-group
 * keys come from GET /api/config at runtime; these are the recency/spend presets and
 * the export column catalog the UI renders directly.
 */

export interface RecencyPreset {
  k: string;
  label: string;
  min?: number;
  max?: number;
}
export const RECENCY: RecencyPreset[] = [
  { k: 'any', label: 'Any' },
  { k: '90', label: '≤ 90d', max: 90 },
  { k: '180', label: '≤ 6mo', max: 180 },
  { k: '365', label: '≤ 1yr', max: 365 },
  { k: 'lapsed', label: 'Lapsed 1–3yr', min: 365, max: 1095 },
  { k: 'custom', label: 'Custom' },
];

export interface SpendPreset {
  label: string;
  min: number;
}
export const SPEND_PRESETS: SpendPreset[] = [
  { label: '$500+', min: 500 },
  { label: '$1k+', min: 1000 },
  { label: '$2.5k+', min: 2500 },
  { label: '$5k+', min: 5000 },
];

// Fallback flag/segment vocab if GET /api/config can't be reached (the backend is the
// source of truth — see audienceQuery.filterConfig).
export const FALLBACK_FLAGS = [
  { f: 'is_member', label: 'EcoFi member' },
  { f: 'has_email', label: 'Has email' },
  { f: 'has_mobile', label: 'Has mobile' },
  { f: 'is_repeat_customer', label: 'Repeat customer' },
];
export const FALLBACK_SEGMENT_GROUPS = [
  { key: 'revenueSegments', label: 'Lifetime revenue tier' },
  { key: 'frequencySegments', label: 'Visit frequency' },
  { key: 'recencySegments', label: 'Paid recency' },
];

export interface ExportColumnGroup {
  group: string;
  cols: { key: string; label: string; def: boolean }[];
}
// Keys/labels mirror COLUMN_CATALOG in lib/customerColumns.ts.
export const EXPORT_COLUMNS: ExportColumnGroup[] = [
  { group: 'Identity', cols: [
    { key: 'customer_id', label: 'Customer ID', def: true },
    { key: 'name', label: 'Name', def: true },
  ] },
  { group: 'Contact', cols: [
    { key: 'email', label: 'Email', def: true },
    { key: 'phone_number', label: 'Phone', def: true },
  ] },
  { group: 'Location', cols: [
    { key: 'city', label: 'City', def: true },
    { key: 'state', label: 'State', def: true },
    { key: 'zip', label: 'ZIP', def: true },
    { key: 'address', label: 'Address', def: false },
  ] },
  { group: 'Activity', cols: [
    { key: 'primary_trade', label: 'Primary trade', def: true },
    { key: 'lifetime_jobs', label: 'Lifetime jobs', def: true },
    { key: 'lifetime_revenue', label: 'Lifetime revenue', def: true },
    { key: 'last_completed_job', label: 'Last job date', def: true },
    { key: 'days_since_last_job', label: 'Days since last job', def: false },
    { key: 'job_tags', label: 'Job tags', def: false },
  ] },
  { group: 'Segments', cols: [
    { key: 'lifetime_revenue_segment', label: 'Revenue segment', def: false },
    { key: 'frequency_segment', label: 'Frequency segment', def: false },
    { key: 'paid_recency_segment', label: 'Recency segment', def: false },
  ] },
  { group: 'Flags', cols: [
    { key: 'is_member', label: 'EcoFi member', def: false },
    { key: 'is_repeat_customer', label: 'Repeat customer', def: false },
    { key: 'has_email', label: 'Has email', def: false },
    { key: 'has_mobile', label: 'Has mobile', def: false },
  ] },
];
