'use client';

import { Clock } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections A". Real version renders recency
 * presets (Any / ≤90d / ≤6mo / ≤1yr / Lapsed 1–3yr / Custom) + a custom day range.
 */
export function RecencySection({ set }: FilterSectionProps) {
  return (
    <Section label="Recency (last job)" icon={<Clock size={14} />} activeCount={sectionActiveCount('recency', set)}>
      <div className="hint">Recency presets + custom range — to be implemented (Filter sections A).</div>
    </Section>
  );
}
