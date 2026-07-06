'use client';

import { BookOpen } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * Blog-engagement min/max range: number of unique blog posts a customer has viewed,
 * summed from the matched website-journey data (edw2.customer_journey). Number inputs
 * commit on blur/Enter, mirroring SpendSection. There are no presets — the counts are
 * tiny (most customers have none), so a preset ladder would be misleading.
 */
export function BlogsSection({ set, onChange }: FilterSectionProps) {
  const commit = (key: 'blogsMin' | 'blogsMax', raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (set[key] === v) return;
    onChange({ ...set, [key]: v });
  };

  return (
    <Section label="Blog engagement" icon={<BookOpen size={14} />} activeCount={sectionActiveCount('blogs', set)}>
      <div className="range">
        <input
          className="fin"
          type="number"
          min={0}
          placeholder="0"
          aria-label="Minimum blog posts read"
          defaultValue={set.blogsMin ?? ''}
          key={`blogsMin-${set.blogsMin ?? ''}`}
          onBlur={(e) => commit('blogsMin', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className="muted nowrap">to</span>
        <input
          className="fin"
          type="number"
          placeholder="any"
          aria-label="Maximum blog posts read"
          defaultValue={set.blogsMax ?? ''}
          key={`blogsMax-${set.blogsMax ?? ''}`}
          onBlur={(e) => commit('blogsMax', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>
      <div className="hint">
        Counts unique blog posts read by tracked website visitors matched to customers. Most
        customers have no tracked visits, so this yields small, focused audiences.
      </div>
    </Section>
  );
}
