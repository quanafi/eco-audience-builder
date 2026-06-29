'use client';

import { DollarSign } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { SPEND_PRESETS } from '../../lib/uiVocab';

/**
 * Lifetime-spend min/max range plus min-only preset chips ($500+ / $1k+ / $2.5k+ / $5k+).
 * A preset sets spendMin and clears spendMax; editing either number input clears the
 * preset selection. The preset/min reverse-mapping lives in editableSet.setFromPayload.
 * (Port of the `spend` section in static/app.js buildFilters().)
 */
export function SpendSection({ set, onChange }: FilterSectionProps) {
  // Number inputs commit on blur/Enter (matching app.js `change` binding); editing
  // clears any active preset since the range is now manual.
  const commit = (key: 'spendMin' | 'spendMax', raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (set[key] === v && set.spendPreset === null) return;
    onChange({ ...set, [key]: v, spendPreset: null });
  };

  const togglePreset = (label: string, min: number) => {
    if (set.spendPreset === label) {
      onChange({ ...set, spendPreset: null, spendMin: null, spendMax: null });
    } else {
      onChange({ ...set, spendPreset: label, spendMin: min, spendMax: null });
    }
  };

  return (
    <Section label="Lifetime spend" icon={<DollarSign size={14} />} activeCount={sectionActiveCount('spend', set)}>
      <div className="range">
        <span className="muted">$</span>
        <input
          className="fin"
          type="number"
          min={0}
          placeholder="0"
          aria-label="Minimum lifetime spend"
          defaultValue={set.spendMin ?? ''}
          key={`spendMin-${set.spendMin ?? ''}`}
          onBlur={(e) => commit('spendMin', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span className="muted nowrap">to $</span>
        <input
          className="fin"
          type="number"
          placeholder="any"
          aria-label="Maximum lifetime spend"
          defaultValue={set.spendMax ?? ''}
          key={`spendMax-${set.spendMax ?? ''}`}
          onBlur={(e) => commit('spendMax', e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </div>
      <div className="chips" style={{ marginTop: 11 }}>
        {SPEND_PRESETS.map((p) => {
          const on = set.spendPreset === p.label;
          return (
            <button
              key={p.label}
              type="button"
              className={`chip${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => togglePreset(p.label, p.min)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
