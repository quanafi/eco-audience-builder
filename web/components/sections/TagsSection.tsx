'use client';

import { useLayoutEffect, useRef, useState } from 'react';
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

  const toggle = (value: string) => {
    const next = set.tags.includes(value) ? set.tags.filter((t) => t !== value) : [...set.tags, value];
    onChange({ ...set, tags: next });
  };

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
          tagOpts.map((o) => {
            const on = set.tags.includes(o.value);
            const hide = q !== '' && !o.value.toLowerCase().includes(q);
            const count = facetCounts?.tags?.[o.value] ?? o.count;
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
          })
        ) : (
          <div className="hint">No tags match.</div>
        )}
      </div>
    </Section>
  );
}
