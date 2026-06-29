'use client';

import { Layers } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections B". Real version renders the three
 * segment groups (revenue tier / visit frequency / paid recency) as chip rows with
 * live facet counts.
 */
export function SegmentsSection({ set }: FilterSectionProps) {
  return (
    <Section label="Segments" icon={<Layers size={14} />} activeCount={sectionActiveCount('segments', set)}>
      <div className="hint">Segment groups — to be implemented (Filter sections B).</div>
    </Section>
  );
}
