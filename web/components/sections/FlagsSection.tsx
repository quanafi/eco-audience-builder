'use client';

import { CheckCheck } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { fmtInt } from '../../lib/format';

/**
 * Reachability / boolean flag chips (EcoFi member / has email / has mobile / repeat
 * customer). The flag keys + labels come from `config.flags` ({f,label}); live
 * per-option counts overlay from `facetCounts.flags` (no static fallback count — chips
 * show a count only once the live counts resolve). Ported from the Reachability block
 * of static/app.js (buildFilters).
 */
export function FlagsSection({ set, facetCounts, config, onChange }: FilterSectionProps) {
  const toggle = (f: string) => {
    const next = set.flags.includes(f) ? set.flags.filter((v) => v !== f) : [...set.flags, f];
    onChange({ ...set, flags: next });
  };

  return (
    <Section
      label="Reachability"
      icon={<CheckCheck size={14} />}
      iconLime
      activeCount={sectionActiveCount('flags', set)}
      style={{ marginBottom: 6 }}
    >
      <div className="chips">
        {config.flags.map((flag) => {
          const on = set.flags.includes(flag.f);
          const count = facetCounts?.flags?.[flag.f];
          return (
            <button
              type="button"
              key={flag.f}
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(flag.f)}
            >
              {flag.label}
              {count != null ? <span className="cnt">{fmtInt(count)}</span> : null}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
