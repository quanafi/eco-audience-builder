'use client';

import { MapPin } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections A". Real version renders region chips
 * (Columbus/Dayton/Cincinnati/Chillicothe) with live facet counts.
 */
export function RegionsSection({ set }: FilterSectionProps) {
  return (
    <Section label="Region" icon={<MapPin size={14} />} activeCount={sectionActiveCount('regions', set)}>
      <div className="hint">Region chips — to be implemented (Filter sections A).</div>
    </Section>
  );
}
