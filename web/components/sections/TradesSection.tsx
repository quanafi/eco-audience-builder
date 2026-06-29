'use client';

import { Wrench } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { fmtInt } from '../../lib/format';

/**
 * Trade chips (OR within the group). Options + base counts come from `facets.trades`;
 * `facetCounts.trades` overlays the live per-option count for the current selection.
 * Clicking a chip toggles the trade in the active set. (Port of the `trades` chip
 * group in static/app.js buildFilters().)
 */
export function TradesSection({ set, facets, facetCounts, onChange }: FilterSectionProps) {
  const live = facetCounts?.trades;
  const toggle = (value: string) => {
    const on = set.trades.includes(value);
    const trades = on ? set.trades.filter((t) => t !== value) : [...set.trades, value];
    onChange({ ...set, trades });
  };
  return (
    <Section label="Trade" icon={<Wrench size={14} />} activeCount={sectionActiveCount('trades', set)}>
      <div className="chips">
        {facets.trades.map((t) => {
          const on = set.trades.includes(t.value);
          const count = live && t.value in live ? live[t.value] : t.count;
          return (
            <button
              key={t.value}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(t.value)}
            >
              {t.value}
              <span className="cnt">{fmtInt(count)}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
