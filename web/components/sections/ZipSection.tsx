'use client';

import { Hash } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections A". Real version renders a ZIP text
 * input (comma/space separated 5-digit ZIPs) with an inline validity hint.
 */
export function ZipSection({ set }: FilterSectionProps) {
  return (
    <Section label="ZIP code" icon={<Hash size={14} />} activeCount={sectionActiveCount('zip', set)}>
      <div className="hint">ZIP input — to be implemented (Filter sections A).</div>
    </Section>
  );
}
