'use client';

import { Layers } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount, type EditableSet } from '../../lib/editableSet';
import { fmtInt, segLabel } from '../../lib/format';

/**
 * The three segment groups (lifetime revenue tier / visit frequency / paid recency)
 * rendered as multi-select chip rows. Options + base counts come from
 * `facets.segments[groupKey]`; group keys/labels from `config.segmentGroups`; live
 * per-option counts overlay from `facetCounts`. Ported from the Segments block of
 * static/app.js (buildFilters).
 */
export function SegmentsSection({ set, facets, facetCounts, config, onChange }: FilterSectionProps) {
  const toggle = (key: keyof EditableSet, value: string) => {
    const arr = set[key] as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onChange({ ...set, [key]: next });
  };

  return (
    <Section label="Segments" icon={<Layers size={14} />} activeCount={sectionActiveCount('segments', set)}>
      {config.segmentGroups.map((g) => {
        const opts = facets.segments[g.key] ?? [];
        if (!opts.length) return null;
        const selected = (set[g.key as keyof EditableSet] as string[]) ?? [];
        return (
          <div key={g.key}>
            <div className="fsublabel">{g.label}</div>
            <div className="chips">
              {opts.map((o) => {
                const on = selected.includes(o.value);
                const count = facetCounts?.[g.key]?.[o.value] ?? o.count;
                return (
                  <button
                    type="button"
                    key={o.value}
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(g.key as keyof EditableSet, o.value)}
                  >
                    {segLabel(o.value)}
                    <span className="cnt">{fmtInt(count)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Section>
  );
}
