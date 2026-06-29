'use client';

import { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import { Section } from '../Section';
import type { FilterSectionProps } from '../contracts';
import { sectionActiveCount } from '../../lib/editableSet';

/**
 * Free-text ZIP entry (comma/space separated). The raw string is stored on the set as
 * `zips`; setPayload forwards it and the backend parses/validates 5-digit ZIPs. An inline
 * hint shows when the user has typed something but none of it parses to a 5-digit ZIP.
 * Commits on blur/Enter so the debounced query doesn't fire per keystroke. (Port of the
 * `zip` section in static/app.js buildFilters().)
 */
export function ZipSection({ set, onChange }: FilterSectionProps) {
  const [text, setText] = useState(set.zips);

  // Keep local text in sync when the set changes from outside (e.g. loading a saved
  // audience or clearing all filters).
  useEffect(() => {
    setText(set.zips);
  }, [set.zips]);

  const tokens = text.split(/[\s,]+/).map((z) => z.trim()).filter(Boolean);
  const invalid = tokens.length > 0 && !tokens.some((z) => /^\d{5}$/.test(z));

  const commit = () => {
    if (text === set.zips) return;
    onChange({ ...set, zips: text });
  };

  return (
    <Section label="ZIP code" icon={<Hash size={14} />} activeCount={sectionActiveCount('zip', set)}>
      <input
        className="fin"
        type="text"
        inputMode="numeric"
        aria-label="ZIP codes"
        placeholder="e.g. 43230, 45601"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {invalid ? (
        <div className="hint">
          Enter one or more 5-digit ZIPs like <b>43230</b>.
        </div>
      ) : null}
    </Section>
  );
}
