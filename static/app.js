'use strict';

// Customer profile in ServiceTitan. {id} is the customer_id. Mirrors ST_CUSTOMER_URL in app/export.py.
const ST_CUSTOMER_URL = 'https://go.servicetitan.com/#/customer/{id}';
const stUrl = (id) => ST_CUSTOMER_URL.replace('{id}', encodeURIComponent(id));

// ---- static filter vocab (must match app/audience_query.py allow-lists) ----
const RECENCY = [
  { k: 'any', label: 'Any' },
  { k: '90', label: '≤ 90d', max: 90 },
  { k: '180', label: '≤ 6mo', max: 180 },
  { k: '365', label: '≤ 1yr', max: 365 },
  { k: 'lapsed', label: 'Lapsed 1–3yr', min: 365, max: 1095 },
  { k: 'custom', label: 'Custom' },
];
const SPEND_PRESETS = [
  { label: '$500+', min: 500 },
  { label: '$1k+', min: 1000 },
  { label: '$2.5k+', min: 2500 },
  { label: '$5k+', min: 5000 },
];
const FLAGS = [
  { f: 'is_member', label: 'EcoFi member' },
  { f: 'has_email', label: 'Has email' },
  { f: 'has_mobile', label: 'Has mobile' },
  { f: 'is_repeat_customer', label: 'Repeat customer' },
];
const SEGMENT_GROUPS = [
  { key: 'revenueSegments', label: 'Lifetime revenue tier' },
  { key: 'frequencySegments', label: 'Visit frequency' },
  { key: 'recencySegments', label: 'Paid recency' },
];
// Export column catalog — keys/labels mirror COLUMN_CATALOG in app/export.py.
const EXPORT_COLUMNS = [
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

const ICONS = {
  trade: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
};

function emptySet() {
  return {
    trades: [], regions: [],
    recency: 'any', recMin: null, recMax: null,
    zips: '', spendMin: null, spendMax: null, spendPreset: null,
    revenueSegments: [], frequencySegments: [], recencySegments: [],
    flags: [],
    tags: [],
  };
}

const state = {
  facets: null,
  facetCounts: null,                                 // dynamic per-option counts for current selection
  mode: 'include',                                   // which filter set the UI is editing
  sets: { include: emptySet(), exclude: emptySet() },
  tagSearch: '',                                     // transient: filters the (long) tag list
  tab: 'preview', sql: '',
};

// Preserve the tag list's scroll position across full filter re-renders.
let _tagScroll = 0;

// The filter set currently being edited.
const cur = () => state.sets[state.mode];

// Per-option count: live count for the current selection, falling back to the static facet total.
const cnt = (group, value, fallback) => {
  const live = state.facetCounts && state.facetCounts[group];
  return (live && value in live) ? live[value] : fallback;
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtMoney = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
const segLabel = (v) => String(v).replace(/^\s*\d+\.\s*/, '');
const ago = (d) => d == null ? '—' : (d < 31 ? d + 'd' : d < 365 ? Math.round(d / 30) + 'mo' : (d / 365).toFixed(1) + 'yr');
const fmtMonth = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

function toggle(arr, v) { const i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); }

// ---------------------------------------------------------------- rendering
function icon(path, lime) {
  return `<span class="ficon${lime ? ' lime' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${lime ? '#003057' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

function chip(label, on, count) {
  const c = count != null ? `<span class="cnt">${fmtInt(count)}</span>` : '';
  return `<button type="button" class="chip${on ? ' on' : ''}">${esc(label)}${c}</button>`;
}

function buildFilters() {
  const f = state.facets;
  const s = cur();
  const html = [];

  // Trade
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.trade)}Trade</div><div class="chips" data-group="trades">` +
    f.trades.map((t) => chip(t.value, s.trades.includes(t.value), cnt('trades', t.value, t.count))).join('') + `</div></div>`);

  // Recency
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.clock)}Recency (last job)</div>` +
    `<div class="segs" data-group="recency">` +
    RECENCY.map((r) => `<button type="button" class="seg${s.recency === r.k ? ' on' : ''}" data-k="${r.k}">${r.label}</button>`).join('') + `</div>` +
    (s.recency === 'custom'
      ? `<div class="range"><input class="fin" type="number" min="0" placeholder="min" id="recMin" value="${s.recMin ?? ''}"><span class="muted">to</span><input class="fin" type="number" placeholder="max" id="recMax" value="${s.recMax ?? ''}"><span class="muted nowrap">days ago</span></div>`
      : '') + `</div>`);

  // Region
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.pin)}Region</div><div class="chips" data-group="regions">` +
    f.regions.map((r) => chip(r.value, s.regions.includes(r.value), cnt('regions', r.value, r.count))).join('') + `</div></div>`);

  // ZIP
  const zl = s.zips.split(/[\s,]+/).map((z) => z.trim()).filter(Boolean);
  const zinvalid = zl.length > 0 && !zl.some((z) => /^\d{5}$/.test(z));
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.hash)}ZIP code</div>` +
    `<input class="fin" type="text" inputmode="numeric" id="zip" placeholder="e.g. 43230, 45601" value="${esc(s.zips)}">` +
    (zinvalid ? `<div class="hint">Enter one or more 5-digit ZIPs like <b>43230</b>.</div>` : '') + `</div>`);

  // Spend
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.dollar)}Lifetime spend</div>` +
    `<div class="range"><span class="muted">$</span><input class="fin" type="number" min="0" placeholder="0" id="spendMin" value="${s.spendMin ?? ''}"><span class="muted nowrap">to $</span><input class="fin" type="number" placeholder="any" id="spendMax" value="${s.spendMax ?? ''}"></div>` +
    `<div class="chips" data-group="spendPreset" style="margin-top:11px">` +
    SPEND_PRESETS.map((p) => chip(p.label, s.spendPreset === p.label)).join('') + `</div></div>`);

  // Segments
  let segHtml = `<div class="fsection"><div class="fhead">${icon(ICONS.layers)}Segments</div>`;
  for (const g of SEGMENT_GROUPS) {
    const opts = (f.segments[g.key] || []);
    if (!opts.length) continue;
    segHtml += `<div class="fsublabel">${g.label}</div><div class="chips" data-group="${g.key}">` +
      opts.map((o) => chip(segLabel(o.value), s[g.key].includes(o.value), cnt(g.key, o.value, o.count))).join('') + `</div>`;
  }
  segHtml += `</div>`;
  html.push(segHtml);

  // Reachability
  html.push(`<div class="fsection" style="margin-bottom:6px"><div class="fhead">${icon(ICONS.check, true)}Reachability</div>` +
    `<div class="chips" data-group="flags">` +
    FLAGS.map((x) => chip(x.label, s.flags.includes(x.f), cnt('flags', x.f, undefined))).join('') + `</div></div>`);

  $('filters').innerHTML = html.join('');
  wireFilters(f);
  updateBadges();
}

function wireFilters(f) {
  // chip groups that map to value arrays
  const arrayGroups = { trades: f.trades.map((t) => t.value), regions: f.regions.map((r) => r.value) };
  for (const g of SEGMENT_GROUPS) arrayGroups[g.key] = (f.segments[g.key] || []).map((o) => o.value);

  document.querySelectorAll('.chips[data-group]').forEach((box) => {
    const group = box.dataset.group;
    box.querySelectorAll('.chip').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const s = cur();
        if (group === 'flags') { toggle(s.flags, FLAGS[i].f); }
        else if (group === 'spendPreset') {
          const p = SPEND_PRESETS[i];
          if (s.spendPreset === p.label) { s.spendPreset = null; s.spendMin = null; s.spendMax = null; }
          else { s.spendPreset = p.label; s.spendMin = p.min; s.spendMax = null; }
        } else { toggle(s[group], arrayGroups[group][i]); }
        buildFilters(); refresh();
      });
    });
  });

  document.querySelectorAll('.seg[data-k]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = cur();
      s.recency = btn.dataset.k;
      if (s.recency !== 'custom') { s.recMin = null; s.recMax = null; }
      buildFilters(); refresh();
    });
  });

  bindNum('recMin', 'recMin'); bindNum('recMax', 'recMax');
  bindNum('spendMin', 'spendMin', () => { cur().spendPreset = null; });
  bindNum('spendMax', 'spendMax', () => { cur().spendPreset = null; });
  bindText('zip', 'zips');
}

function bindNum(id, key, after) {
  const el = $(id); if (!el) return;
  el.addEventListener('change', () => {
    const v = el.value; cur()[key] = v === '' ? null : Number(v);
    if (after) after(); buildFilters(); refresh();
  });
}
function bindText(id, key) {
  const el = $(id); if (!el) return;
  el.addEventListener('change', () => { cur()[key] = el.value; buildFilters(); refresh(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}

function setActiveCount(s) {
  const zl = s.zips.split(/[\s,]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  return s.trades.length + s.regions.length + s.flags.length +
    s.revenueSegments.length + s.frequencySegments.length + s.recencySegments.length +
    (s.recency !== 'any' ? 1 : 0) + (zl.length ? 1 : 0) +
    ((s.spendMin != null || s.spendMax != null) ? 1 : 0);
}

function updateBadges() {
  const inc = setActiveCount(state.sets.include);
  const exc = setActiveCount(state.sets.exclude);
  const setCnt = (id, n) => { const el = $(id); if (el) { el.textContent = n || ''; el.hidden = !n; } };
  setCnt('cntInclude', inc);
  setCnt('cntExclude', exc);
  const b = $('activeBadge');
  const total = inc + exc;
  if (total > 0) { b.textContent = total + ' active'; b.hidden = false; } else { b.hidden = true; }
}

// ---------------------------------------------------------------- payload + query
function setPayload(s) {
  const r = RECENCY.find((x) => x.k === s.recency) || {};
  let recencyMin = null, recencyMax = null;
  if (s.recency === 'custom') { recencyMin = s.recMin; recencyMax = s.recMax; }
  else { recencyMin = r.min ?? null; recencyMax = r.max ?? null; }
  return {
    trades: s.trades, regions: s.regions,
    recencyMin, recencyMax,
    zips: s.zips,
    spendMin: s.spendMin, spendMax: s.spendMax,
    revenueSegments: s.revenueSegments,
    frequencySegments: s.frequencySegments,
    recencySegments: s.recencySegments,
    flags: s.flags,
    tags: s.tags,
  };
}

function payload() {
  // Include fields at the top level (back-compat with /api/audience); exclude nested.
  // `mode` tells the backend which set's chips to compute live facet counts for.
  return { ...setPayload(state.sets.include), exclude: setPayload(state.sets.exclude), mode: state.mode };
}

let _seq = 0, _timer = null;
function refresh() {
  clearTimeout(_timer);
  _timer = setTimeout(runQuery, 220);
}

async function runQuery() {
  const seq = ++_seq;
  document.querySelector('.results').classList.add('loading');
  try {
    const res = await fetch('/api/audience', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
    });
    const data = await res.json();
    if (seq !== _seq) return; // a newer request superseded this one
    if (data.error) { showError(data.error); return; }
    renderResult(data);
  } catch (e) {
    if (seq === _seq) showError(String(e));
  } finally {
    if (seq === _seq) document.querySelector('.results').classList.remove('loading');
  }
}

function renderResult(d) {
  state.sql = d.sql || '';
  $('statAudience').textContent = fmtInt(d.audienceCount);
  $('statPct').textContent = (d.pctBase || 0).toFixed(1) + '%';
  $('statReach').textContent = fmtInt(d.reachCount);
  $('statAvg').textContent = fmtMoney(d.avgValue);

  const setBar = (id, pct, color) => { const el = $(id); el.style.width = Math.max(0, Math.min(100, pct)) + '%'; el.style.background = color; };
  setBar('barAudience', d.pctBase, 'var(--lime)');
  setBar('barPct', d.pctBase, 'var(--lime)');
  setBar('barReach', d.audienceCount ? d.reachCount / d.audienceCount * 100 : 0, 'var(--cyan)');
  setBar('barAvg', d.avgValue / 5000 * 100, 'var(--green)');

  const has = d.rows.length > 0;
  $('empty').hidden = has;
  $('caption').style.display = has ? '' : 'none';
  if (has) {
    const cap = d.audienceCount > d.rows.length
      ? `Showing top ${fmtInt(d.rows.length)} of ${fmtInt(d.audienceCount)} matches by lifetime value`
      : `${fmtInt(d.audienceCount)} ${d.audienceCount === 1 ? 'match' : 'matches'}`;
    $('captionText').textContent = cap;
  }
  $('rows').innerHTML = d.rows.map(rowHtml).join('');
  renderSql();
  // Refresh the filter chips with live per-option counts for the current selection.
  state.facetCounts = d.facetCounts || null;
  buildFilters();
}

function rowHtml(r) {
  const loc = [r.city, r.state].filter(Boolean).join(', ');
  const mail = r.has_email ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>' : '';
  const mob = r.has_mobile ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><line x1="12" y1="18" x2="12" y2="18"/></svg>' : '';
  const eco = r.is_member ? '<span class="tag tag-eco">EcoFi</span>' : '';
  return `<tr>
    <td><div class="cust-name">${esc(r.name)}</div><a class="cust-sub cust-link" href="${esc(stUrl(r.customer_id))}" target="_blank" rel="noopener" title="Open in ServiceTitan">#${esc(r.customer_id)}</a></td>
    <td><div>${esc(loc || '—')}</div><div class="loc-sub">${esc(r.zip || '')}</div></td>
    <td><span class="tag">${esc(r.primary_trade)}</span></td>
    <td class="num">${fmtInt(r.lifetime_jobs)}</td>
    <td class="num"><strong>${fmtMoney(r.lifetime_revenue)}</strong></td>
    <td class="num"><div>${ago(r.days_since_last_job)}</div><div class="date-sub">${esc(fmtMonth(r.last_completed_job))}</div></td>
    <td><div class="flags">${eco}${mail}${mob}</div></td>
  </tr>`;
}

function showError(msg) {
  $('rows').innerHTML = '';
  $('caption').style.display = 'none';
  $('empty').hidden = false;
  $('empty').querySelector('.empty-title').textContent = 'Query error';
  $('empty').querySelector('.empty-sub').textContent = msg;
}

// ---------------------------------------------------------------- SQL tab
const KW = new Set(['select', 'from', 'where', 'and', 'or', 'in', 'any', 'order', 'by', 'desc', 'asc', 'nulls', 'last', 'true', 'false', 'as', 'case', 'when', 'then', 'else', 'end', 'is', 'not', 'null', 'greatest', 'coalesce', 'substring']);
function renderSql() {
  const code = $('sqlCode');
  const out = [];
  state.sql.split('\n').forEach((line, i, arr) => {
    if (/^\s*--/.test(line)) out.push(`<span class="com">${esc(line)}</span>`);
    else {
      const re = /('[^']*')|([A-Za-z_][A-Za-z0-9_]*)|(\d+\.?\d*)|(\s+)|([(),;>=<]+)|(.)/g; let m;
      while ((m = re.exec(line))) {
        if (m[1]) out.push(`<span class="str">${esc(m[1])}</span>`);
        else if (m[2]) out.push(`<span class="${KW.has(m[2].toLowerCase()) ? 'kw' : 'pl'}">${esc(m[2])}</span>`);
        else if (m[3]) out.push(`<span class="num">${esc(m[3])}</span>`);
        else out.push(`<span class="pl">${esc(m[0])}</span>`);
      }
    }
    if (i < arr.length - 1) out.push('\n');
  });
  code.innerHTML = out.join('');
}

// ---------------------------------------------------------------- wiring
function setTab(tab) {
  state.tab = tab;
  $('tabPreview').classList.toggle('tab-on', tab === 'preview');
  $('tabSql').classList.toggle('tab-on', tab === 'sql');
  $('previewPane').hidden = tab !== 'preview';
  $('sqlPane').hidden = tab !== 'sql';
}

function clearAll() {
  state.sets.include = emptySet();
  state.sets.exclude = emptySet();
  buildFilters(); refresh();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('mode-on', b.dataset.mode === mode));
  $('modeToggle').classList.toggle('mode-exclude', mode === 'exclude');
  $('modeHint').textContent = mode === 'exclude'
    ? 'Customers matching ANY of these are removed from the audience.'
    : 'Customers must match these filters.';
  // Counts are computed for the active set, so recompute when the mode changes.
  state.facetCounts = null;
  buildFilters();
  refresh();
}

// ---------------------------------------------------------------- export
function setupExport() {
  $('exportCols').innerHTML = EXPORT_COLUMNS.map((grp) =>
    `<div class="export-grp"><div class="export-grp-lbl">${grp.group}</div>` +
    grp.cols.map((c) => `<label class="export-col"><input type="checkbox" value="${c.key}"${c.def ? ' checked' : ''}>${esc(c.label)}</label>`).join('') +
    `</div>`).join('');

  const btn = $('exportBtn'), panel = $('exportPanel');
  btn.addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { panel.hidden = true; });
  $('exportDownload').addEventListener('click', doExport);
}

async function doExport() {
  const columns = Array.from($('exportCols').querySelectorAll('input:checked')).map((i) => i.value);
  if (!columns.length) { $('exportNote').textContent = 'Pick at least one column.'; return; }
  const format = document.querySelector('input[name="expfmt"]:checked').value;
  const btn = $('exportDownload'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Preparing…'; $('exportNote').textContent = '';
  try {
    const res = await fetch('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: payload(), columns, format }),
    });
    if (!res.ok) {
      let msg = 'Export failed';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
      $('exportNote').textContent = msg; return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `audience-${stamp}.${format}`;
    document.body.appendChild(a);
    a.click();
    // Defer cleanup: revoking the object URL synchronously after click() aborts
    // the download in Chrome/Firefox before the file is written.
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
    $('exportPanel').hidden = true;
  } catch (e) {
    $('exportNote').textContent = String(e);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

async function init() {
  $('tabPreview').addEventListener('click', () => setTab('preview'));
  $('tabSql').addEventListener('click', () => setTab('sql'));
  $('clearAll').addEventListener('click', clearAll);
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  setupExport();
  $('copySql').addEventListener('click', () => {
    navigator.clipboard.writeText(state.sql).catch(() => {});
    const b = $('copySql'); const t = b.textContent; b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = t; }, 1400);
  });

  try {
    const res = await fetch('/api/facets');
    const f = await res.json();
    if (f.error) { showError(f.error); return; }
    state.facets = f;
    $('baseCount').textContent = fmtInt(f.baseCount) + ' customers';
    buildFilters();
    runQuery();
  } catch (e) {
    showError('Could not load facets: ' + e);
  }
}

init();
