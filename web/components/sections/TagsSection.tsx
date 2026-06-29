'use client';

import { Tag } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * STUB — replaced by Wave-2 unit "Filter sections B". Real version renders selected tag
 * chips + a searchable, scrollable tag list (the tag universe loads async via
 * facets.tags); each option shows its distinct-customer reach.
 */
export function TagsSection({ set }: FilterSectionProps) {
  return (
    <Section label="Job tags" icon={<Tag size={14} />} activeCount={sectionActiveCount('tags', set)}>
      <div className="hint">Searchable tag list — to be implemented (Filter sections B).</div>
    </Section>
  );
}
