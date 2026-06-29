'use client';

import { CheckCheck } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections B". Real version renders reachability
 * flag chips (EcoFi member / has email / has mobile / repeat customer), keyed off the
 * backend flag vocab in `facets`.
 */
export function FlagsSection({ set }: FilterSectionProps) {
  return (
    <Section
      label="Reachability"
      icon={<CheckCheck size={14} />}
      iconLime
      activeCount={sectionActiveCount('flags', set)}
      style={{ marginBottom: 6 }}
    >
      <div className="hint">Reachability flags — to be implemented (Filter sections B).</div>
    </Section>
  );
}
