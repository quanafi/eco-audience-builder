'use client';

/**
 * Central client state container (port of the static/app.js state machine).
 *
 * Owns: the include/exclude editable sets, the active `mode`, the live facet counts,
 * the latest audience result, and tab state. Drives a debounced (220ms) /api/audience
 * refresh with a sequence guard so a stale response never overwrites a newer one. Loads
 * the filter vocab (config), base facets, then the tag universe (async — the tag query
 * is slow). Renders the typed section / results / panel components (stubs until Wave-2
 * fills them in).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/apiClient';
import { buildPayload, emptySet, setActiveCount, setFromPayload, type EditableSet } from '../lib/editableSet';
import { FALLBACK_FLAGS, FALLBACK_SEGMENT_GROUPS } from '../lib/uiVocab';
import { fmtInt } from '../lib/format';
import type { AudienceResponse, Config, Facets, FacetCounts, FilterPayload } from '../lib/types';

import { TradesSection } from './sections/TradesSection';
import { RecencySection } from './sections/RecencySection';
import { RegionsSection } from './sections/RegionsSection';
import { ZipSection } from './sections/ZipSection';
import { SpendSection } from './sections/SpendSection';
import { SegmentsSection } from './sections/SegmentsSection';
import { TagsSection } from './sections/TagsSection';
import { FlagsSection } from './sections/FlagsSection';
import { StatsCharts } from './results/StatsCharts';
import { PreviewTable } from './results/PreviewTable';
import { SavePanel } from './panels/SavePanel';
import { TagPanel } from './panels/TagPanel';
import { ExportPanel } from './panels/ExportPanel';
import { AdsPanel } from './panels/AdsPanel';

type Mode = 'include' | 'exclude';
type Sets = { include: EditableSet; exclude: EditableSet };

export function AudienceBuilder() {
  const [config, setConfig] = useState<Config | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetCounts, setFacetCounts] = useState<FacetCounts | null>(null);
  const [mode, setMode] = useState<Mode>('include');
  const [sets, setSets] = useState<Sets>({ include: emptySet(), exclude: emptySet() });
  const [result, setResult] = useState<AudienceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest state for the debounced query (which reads refs, not stale closures).
  const stateRef = useRef({ sets, mode });
  stateRef.current = { sets, mode };
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuery = useCallback(async () => {
    const seq = ++seqRef.current;
    const body = buildPayload(stateRef.current.sets, stateRef.current.mode);
    setLoading(true);
    try {
      const data = await api.audience(body);
      if (seq !== seqRef.current) return; // superseded by a newer request
      if (data.error) {
        setError(data.error);
        return;
      }
      setError(null);
      setResult(data);
      setFacetCounts(data.facetCounts ?? null);
    } catch (e) {
      if (seq === seqRef.current) setError(String(e));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runQuery, 220);
  }, [runQuery]);

  // Initial load: config, facets, the first audience query, and the tag universe are
  // independent (none needs another's result), so they run concurrently and each is
  // applied as it resolves. Every handler is guarded by `cancelled` so an unmount
  // mid-flight can't set state on a dead component.
  useEffect(() => {
    let cancelled = false;

    // config is best-effort — on error/absence we keep the hardcoded FALLBACK_* vocab.
    const applyConfig = (cfg: Config | { error?: string }) => {
      if (!cancelled && cfg && !(cfg as { error?: string }).error) setConfig(cfg as Config);
    };
    // facets is required for the section counts; its error is the one we surface.
    const applyFacets = (f: Facets | { error?: string }) => {
      if (cancelled) return;
      if ((f as { error?: string }).error) {
        setError((f as { error?: string }).error!);
        return;
      }
      setFacets(f as Facets);
    };
    // Tag universe loads separately (its reach query is slow); merge into facets when ready.
    const applyTags = (d: Awaited<ReturnType<typeof api.tags>>) => {
      if (cancelled || !d || d.error || !d.tags) return;
      setFacets((prev) => (prev ? { ...prev, tags: d.tags } : prev));
    };

    // Fire all four concurrently — none awaits another, so first paint no longer pays a
    // config→facets→audience round-trip chain.
    api.config().then(applyConfig).catch(() => {}); // best-effort: keep fallbacks
    api
      .facets()
      .then(applyFacets)
      .catch((e) => {
        if (!cancelled) setError('Could not load facets: ' + String(e));
      });
    runQuery(); // manages its own loading/error state; no longer gated on facets
    api.tags().then(applyTags).catch(() => {}); // slow reach query; never blocks the page

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current); // drop any pending debounce
    };
  }, [runQuery]);

  const cur = sets[mode];
  const onSectionChange = useCallback(
    (next: EditableSet) => {
      setSets((prev) => ({ ...prev, [mode]: next }));
      scheduleRefresh();
    },
    [mode, scheduleRefresh],
  );

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setFacetCounts(null); // counts are computed for the active set
    scheduleRefresh();
  };

  const clearAll = () => {
    setSets({ include: emptySet(), exclude: emptySet() });
    scheduleRefresh();
  };

  const applyPayload = useCallback(
    (filters: FilterPayload) => {
      setSets({
        include: setFromPayload(filters),
        exclude: setFromPayload(filters.exclude ?? {}),
      });
      setMode(filters.mode === 'exclude' ? 'exclude' : 'include');
      setFacetCounts(null);
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const payload = useMemo(() => buildPayload(sets, mode), [sets, mode]);
  const cfg: Config = {
    flags: config?.flags?.length ? config.flags : FALLBACK_FLAGS,
    segmentGroups: config?.segmentGroups?.length ? config.segmentGroups : FALLBACK_SEGMENT_GROUPS,
    trades: config?.trades ?? [],
    regions: config?.regions ?? [],
  };

  const incCount = setActiveCount(sets.include);
  const excCount = setActiveCount(sets.exclude);
  const totalActive = incCount + excCount;

  const sectionProps = facets
    ? { facets, facetCounts, config: cfg, set: cur, onChange: onSectionChange }
    : null;

  return (
    <>
      <header className="hdr">
        <div className="hdr-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eco-logo.png" alt="eco" />
          <div className="hdr-div" />
          <div>
            <h1 className="hdr-title">Audience Builder</h1>
            <div className="hdr-sub">Marketing Segmentation</div>
          </div>
        </div>
      </header>
      <div className="brandbar" />

      <div className="wrap">
        <div className="layout">
          {/* ============ FILTERS ============ */}
          <aside className="panel filters">
            <div className="filters-head">
              <h2>Build Segment</h2>
              {totalActive > 0 ? <span className="active-badge">{totalActive} active</span> : null}
            </div>
            <div className={`mode-toggle${mode === 'exclude' ? ' mode-exclude' : ''}`}>
              <button
                type="button"
                className={`mode-btn${mode === 'include' ? ' mode-on' : ''}`}
                onClick={() => switchMode('include')}
              >
                Include{incCount ? <span className="mode-cnt">{incCount}</span> : null}
              </button>
              <button
                type="button"
                className={`mode-btn${mode === 'exclude' ? ' mode-on' : ''}`}
                data-mode="exclude"
                onClick={() => switchMode('exclude')}
              >
                Exclude{excCount ? <span className="mode-cnt">{excCount}</span> : null}
              </button>
            </div>
            <div className="mode-hint">
              {mode === 'exclude'
                ? 'Customers matching ANY of these are removed from the audience.'
                : 'Customers must match these filters.'}
            </div>
            <div className="filters-body">
              {sectionProps ? (
                <>
                  <TradesSection {...sectionProps} />
                  <FlagsSection {...sectionProps} />
                  <RecencySection {...sectionProps} />
                  <RegionsSection {...sectionProps} />
                  <ZipSection {...sectionProps} />
                  <SpendSection {...sectionProps} />
                  <SegmentsSection {...sectionProps} />
                  <TagsSection {...sectionProps} />
                </>
              ) : (
                <div className="hint">Loading filters…</div>
              )}
            </div>
            <div className="filters-foot">
              <button type="button" className="btn-clear" onClick={clearAll}>
                Clear all filters
              </button>
            </div>
          </aside>

          {/* ============ RESULTS ============ */}
          <section className={`results${loading ? ' loading' : ''}`}>
            <StatsCharts data={result} />

            <div className="panel card">
              <div className="tabs">
                <h2 className="panel-title">Audience preview</h2>
                <div className="card-actions">
                  <SavePanel payload={payload} onLoad={applyPayload} />
                  <TagPanel payload={payload} lastCount={result?.audienceCount ?? null} />
                  <ExportPanel payload={payload} />
                  <AdsPanel payload={payload} lastCount={result?.audienceCount ?? null} />
                </div>
              </div>

              <PreviewTable
                rows={result?.rows ?? []}
                audienceCount={result?.audienceCount ?? 0}
                loading={loading}
                error={error}
              />
            </div>

            <footer className="foot">
              Live segment over{' '}
              <strong>{facets ? `${fmtInt(facets.baseCount)} customers` : 'all customers'}</strong> in{' '}
              <code>edw2.customers</code> · ServiceTitan-derived customer mart.
              <br />
              {facets && facets.suppressedCount ? (
                <span className="foot-suppress">
                  {fmtInt(facets.suppressedCount)} customers removed for do-not-contact opt-outs and never
                  appear in any audience.
                </span>
              ) : null}
            </footer>
          </section>
        </div>
      </div>
    </>
  );
}
