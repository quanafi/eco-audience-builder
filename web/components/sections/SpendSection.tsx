'use client';

import { DollarSign } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections A". Real version renders a min/max
 * lifetime-spend range plus the preset chips ($500+ / $1k+ / $2.5k+ / $5k+).
 */
export function SpendSection({ set }: FilterSectionProps) {
  return (
    <Section label="Lifetime spend" icon={<DollarSign size={14} />} activeCount={sectionActiveCount('spend', set)}>
      <div className="hint">Spend range + presets — to be implemented (Filter sections A).</div>
    </Section>
  );
}
