'use client';

import { Clock } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';
import { RECENCY } from '../../lib/uiVocab';

/**
 * Recency presets (Any / ≤90d / ≤6mo / ≤1yr / Lapsed 1–3yr / Custom) plus a custom
 * min/max day range that only shows when "Custom" is selected. Picking a non-custom
 * preset clears any custom range; the preset/range reverse-mapping lives in
 * editableSet.setPayload / setFromPayload. (Port of the `recency` group in app.js.)
 */
export function RecencySection({ set, onChange }: FilterSectionProps) {
  const pick = (k: string) => {
    if (k === set.recency) return;
    const next = { ...set, recency: k };
    if (k !== 'custom') {
      next.recMin = null;
      next.recMax = null;
    }
    onChange(next);
  };

  // Number inputs commit on blur/Enter (matching app.js `change` binding) so the
  // debounced query doesn't fire on every keystroke.
  const commit = (key: 'recMin' | 'recMax', raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (set[key] === v) return;
    onChange({ ...set, [key]: v });
  };

  return (
    <Section label="Recency (last job)" icon={<Clock size={14} />} activeCount={sectionActiveCount('recency', set)}>
      <div className="segs">
        {RECENCY.map((r) => (
          <button
            key={r.k}
            type="button"
            className={`seg${set.recency === r.k ? ' on' : ''}`}
            aria-pressed={set.recency === r.k}
            onClick={() => pick(r.k)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {set.recency === 'custom' ? (
        <div className="range">
          <input
            className="fin"
            type="number"
            min={0}
            placeholder="min"
            aria-label="Minimum days ago"
            defaultValue={set.recMin ?? ''}
            key={`recMin-${set.recMin ?? ''}`}
            onBlur={(e) => commit('recMin', e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span className="muted">to</span>
          <input
            className="fin"
            type="number"
            placeholder="max"
            aria-label="Maximum days ago"
            defaultValue={set.recMax ?? ''}
            key={`recMax-${set.recMax ?? ''}`}
            onBlur={(e) => commit('recMax', e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span className="muted nowrap">days ago</span>
        </div>
      ) : null}
    </Section>
  );
}
