'use client';

import { Wrench } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections A". Real version renders trade chips
 * (Plumbing/HVAC/Electric) with live facet counts. Honors FilterSectionProps.
 */
export function TradesSection({ set }: FilterSectionProps) {
  return (
    <Section label="Trade" icon={<Wrench size={14} />} activeCount={sectionActiveCount('trades', set)}>
      <div className="hint">Trade chips — to be implemented (Filter sections A).</div>
    </Section>
  );
}
