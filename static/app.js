'use strict';

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

const ICONS = {
  trade: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
};

const state = {
  facets: null,
  trades: [], regions: [],
  recency: 'any', recMin: null, recMax: null,
  zips: '', spendMin: null, spendMax: null, spendPreset: null,
  revenueSegments: [], frequencySegments: [], recencySegments: [],
  flags: [],
  tab: 'preview', sql: '',
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
  const html = [];

  // Trade
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.trade)}Trade</div><div class="chips" data-group="trades">` +
    f.trades.map((t) => chip(t.value, state.trades.includes(t.value), t.count)).join('') + `</div></div>`);

  // Recency
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.clock)}Recency (last job)</div>` +
    `<div class="segs" data-group="recency">` +
    RECENCY.map((r) => `<button type="button" class="seg${state.recency === r.k ? ' on' : ''}" data-k="${r.k}">${r.label}</button>`).join('') + `</div>` +
    (state.recency === 'custom'
      ? `<div class="range"><input class="fin" type="number" min="0" placeholder="min" id="recMin" value="${state.recMin ?? ''}"><span class="muted">to</span><input class="fin" type="number" placeholder="max" id="recMax" value="${state.recMax ?? ''}"><span class="muted nowrap">days ago</span></div>`
      : '') + `</div>`);

  // Region
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.pin)}Region</div><div class="chips" data-group="regions">` +
    f.regions.map((r) => chip(r.value, state.regions.includes(r.value), r.count)).join('') + `</div></div>`);

  // ZIP
  const zl = state.zips.split(/[\s,]+/).map((z) => z.trim()).filter(Boolean);
  const zinvalid = zl.length > 0 && !zl.some((z) => /^\d{5}$/.test(z));
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.hash)}ZIP code</div>` +
    `<input class="fin" type="text" inputmode="numeric" id="zip" placeholder="e.g. 43230, 45601" value="${esc(state.zips)}">` +
    (zinvalid ? `<div class="hint">Enter one or more 5-digit ZIPs like <b>43230</b>.</div>` : '') + `</div>`);

  // Spend
  html.push(`<div class="fsection"><div class="fhead">${icon(ICONS.dollar)}Lifetime spend</div>` +
    `<div class="range"><span class="muted">$</span><input class="fin" type="number" min="0" placeholder="0" id="spendMin" value="${state.spendMin ?? ''}"><span class="muted nowrap">to $</span><input class="fin" type="number" placeholder="any" id="spendMax" value="${state.spendMax ?? ''}"></div>` +
    `<div class="chips" data-group="spendPreset" style="margin-top:11px">` +
    SPEND_PRESETS.map((p) => chip(p.label, state.spendPreset === p.label)).join('') + `</div></div>`);

  // Segments
  let segHtml = `<div class="fsection"><div class="fhead">${icon(ICONS.layers)}Segments</div>`;
  for (const g of SEGMENT_GROUPS) {
    const opts = (f.segments[g.key] || []);
    if (!opts.length) continue;
    segHtml += `<div class="fsublabel">${g.label}</div><div class="chips" data-group="${g.key}">` +
      opts.map((o) => chip(segLabel(o.value), state[g.key].includes(o.value), o.count)).join('') + `</div>`;
  }
  segHtml += `</div>`;
  html.push(segHtml);

  // Reachability
  html.push(`<div class="fsection" style="margin-bottom:6px"><div class="fhead">${icon(ICONS.check, true)}Reachability</div>` +
    `<div class="chips" data-group="flags">` +
    FLAGS.map((x) => chip(x.label, state.flags.includes(x.f))).join('') + `</div></div>`);

  $('filters').innerHTML = html.join('');
  wireFilters(f);
  updateActiveBadge();
}

function wireFilters(f) {
  // chip groups that map to value arrays
  const arrayGroups = { trades: f.trades.map((t) => t.value), regions: f.regions.map((r) => r.value) };
  for (const g of SEGMENT_GROUPS) arrayGroups[g.key] = (f.segments[g.key] || []).map((o) => o.value);

  document.querySelectorAll('.chips[data-group]').forEach((box) => {
    const group = box.dataset.group;
    box.querySelectorAll('.chip').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (group === 'flags') { toggle(state.flags, FLAGS[i].f); }
        else if (group === 'spendPreset') {
          const p = SPEND_PRESETS[i];
          if (state.spendPreset === p.label) { state.spendPreset = null; state.spendMin = null; state.spendMax = null; }
          else { state.spendPreset = p.label; state.spendMin = p.min; state.spendMax = null; }
        } else { toggle(state[group], arrayGroups[group][i]); }
        buildFilters(); refresh();
      });
    });
  });

  document.querySelectorAll('.seg[data-k]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.recency = btn.dataset.k;
      if (state.recency !== 'custom') { state.recMin = null; state.recMax = null; }
      buildFilters(); refresh();
    });
  });

  bindNum('recMin', 'recMin'); bindNum('recMax', 'recMax');
  bindNum('spendMin', 'spendMin', () => { state.spendPreset = null; });
  bindNum('spendMax', 'spendMax', () => { state.spendPreset = null; });
  bindText('zip', 'zips');
}

function bindNum(id, key, after) {
  const el = $(id); if (!el) return;
  el.addEventListener('change', () => {
    const v = el.value; state[key] = v === '' ? null : Number(v);
    if (after) after(); buildFilters(); refresh();
  });
}
function bindText(id, key) {
  const el = $(id); if (!el) return;
  el.addEventListener('change', () => { state[key] = el.value; buildFilters(); refresh(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}

function updateActiveBadge() {
  const zl = state.zips.split(/[\s,]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z));
  const n = state.trades.length + state.regions.length + state.flags.length +
    state.revenueSegments.length + state.frequencySegments.length + state.recencySegments.length +
    (state.recency !== 'any' ? 1 : 0) + (zl.length ? 1 : 0) +
    ((state.spendMin != null || state.spendMax != null) ? 1 : 0);
  const b = $('activeBadge');
  if (n > 0) { b.textContent = n + ' active'; b.hidden = false; } else { b.hidden = true; }
}

// ---------------------------------------------------------------- payload + query
function payload() {
  const r = RECENCY.find((x) => x.k === state.recency) || {};
  let recencyMin = null, recencyMax = null;
  if (state.recency === 'custom') { recencyMin = state.recMin; recencyMax = state.recMax; }
  else { recencyMin = r.min ?? null; recencyMax = r.max ?? null; }
  return {
    trades: state.trades, regions: state.regions,
    recencyMin, recencyMax,
    zips: state.zips,
    spendMin: state.spendMin, spendMax: state.spendMax,
    revenueSegments: state.revenueSegments,
    frequencySegments: state.frequencySegments,
    recencySegments: state.recencySegments,
    flags: state.flags,
  };
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
  updateActiveBadge();
}

function rowHtml(r) {
  const loc = [r.city, r.state].filter(Boolean).join(', ');
  const mail = r.has_email ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>' : '';
  const mob = r.has_mobile ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><line x1="12" y1="18" x2="12" y2="18"/></svg>' : '';
  const eco = r.is_member ? '<span class="tag tag-eco">EcoFi</span>' : '';
  return `<tr>
    <td><div class="cust-name">${esc(r.name)}</div><div class="cust-sub">#${esc(r.customer_id)}</div></td>
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
  Object.assign(state, {
    trades: [], regions: [], recency: 'any', recMin: null, recMax: null,
    zips: '', spendMin: null, spendMax: null, spendPreset: null,
    revenueSegments: [], frequencySegments: [], recencySegments: [], flags: [],
  });
  buildFilters(); refresh();
}

async function init() {
  $('tabPreview').addEventListener('click', () => setTab('preview'));
  $('tabSql').addEventListener('click', () => setTab('sql'));
  $('clearAll').addEventListener('click', clearAll);
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
