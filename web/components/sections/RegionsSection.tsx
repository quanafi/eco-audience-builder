'use client';

import { MapPin } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { fmtInt } from '../../lib/format';

/**
 * Region chips (OR within the group). Options + base counts come from `facets.regions`;
 * `facetCounts.regions` overlays the live per-option count for the current selection.
 * (Port of the `regions` chip group in static/app.js buildFilters().)
 */
export function RegionsSection({ set, facets, facetCounts, onChange }: FilterSectionProps) {
  const live = facetCounts?.regions;
  const toggle = (value: string) => {
    const on = set.regions.includes(value);
    const regions = on ? set.regions.filter((r) => r !== value) : [...set.regions, value];
    onChange({ ...set, regions });
  };
  return (
    <Section label="Region" icon={<MapPin size={14} />} activeCount={sectionActiveCount('regions', set)}>
      <div className="chips">
        {facets.regions.map((r) => {
          const on = set.regions.includes(r.value);
          const count = live && r.value in live ? live[r.value] : r.count;
          return (
            <button
              key={r.value}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(r.value)}
            >
              {r.value}
              <span className="cnt">{fmtInt(count)}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
