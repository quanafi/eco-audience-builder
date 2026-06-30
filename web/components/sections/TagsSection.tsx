'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { fmtInt } from '../../lib/format';

/**
 * Job tags — selected-tag chips + a searchable, scrollable list of the (large) tag
 * universe. Options + base counts come from `facets.tags` (loaded async, undefined
 * until then); live per-option counts overlay from `facetCounts.tags`. The search is
 * local transient state and filters the list in place (non-matching options are hidden
 * via the `hidden` attribute rather than unmounted) so the scroll position survives.
 * Scroll position is also preserved across the parent's frequent re-renders. Ported from
 * the Job tags block of static/app.js (buildFilters / filterTagList).
 */
export function TagsSection({ set, facets, facetCounts, onChange }: FilterSectionProps) {
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(0);

  // Preserve the tag list's scroll position across re-renders (the parent rebuilds the
  // whole filter tree on every selection change).
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = scrollRef.current;
  });

  const loaded = facets.tags != null;
  const tagOpts = facets.tags ?? [];
  const q = search.trim().toLowerCase();

  // O(1) membership: the selected set can be re-checked thousands of times while
  // mapping the tag universe, so resolve it once instead of an O(n) Array.includes
  // per row (which made the whole render O(n²)).
  const selected = useMemo(() => new Set(set.tags), [set.tags]);
  const counts = facetCounts?.tags;

  const toggle = useCallback(
    (value: string) => {
      const next = set.tags.includes(value) ? set.tags.filter((t) => t !== value) : [...set.tags, value];
      onChange({ ...set, tags: next });
    },
    [set, onChange],
  );

  // Build the option rows once per meaningful input change. The parent rebuilds
  // sectionProps on every keystroke/count refresh, so without this the full list
  // reconciles each time; here it only recomputes when the universe, the selection,
  // the search query, or the live counts actually change.
  const rows = useMemo(
    () =>
      tagOpts.map((o) => {
        const on = selected.has(o.value);
        const hide = q !== '' && !o.value.toLowerCase().includes(q);
        const count = counts?.[o.value] ?? o.count;
        return (
          <button
            type="button"
            key={o.value}
            className={`tag-opt${on ? ' on' : ''}`}
            aria-pressed={on}
            hidden={hide}
            onClick={() => toggle(o.value)}
          >
            <span className="tag-opt-lbl">{o.value}</span>
            <span className="cnt">{fmtInt(count)}</span>
          </button>
        );
      }),
    [tagOpts, selected, q, counts, toggle],
  );

  const placeholder = loaded ? `Search ${fmtInt(tagOpts.length)} tags…` : 'Loading tags…';

  return (
    <Section label="Job tags" icon={<Tag size={14} />} activeCount={sectionActiveCount('tags', set)}>
      {set.tags.length ? (
        <div className="tag-sel">
          {set.tags.map((t) => (
            <button type="button" key={t} className="chip on" onClick={() => toggle(t)}>
              {t}
              <span className="chip-x">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <input
        className="fin tag-search"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={search}
        disabled={!loaded}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div
        className="tag-list"
        ref={listRef}
        onScroll={(e) => {
          scrollRef.current = e.currentTarget.scrollTop;
        }}
      >
        {!loaded ? (
          <div className="hint">Loading tags…</div>
        ) : tagOpts.length ? (
          rows
        ) : (
          <div className="hint">No tags match.</div>
        )}
      </div>
    </Section>
  );
}
