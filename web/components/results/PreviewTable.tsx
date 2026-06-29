'use client';

import type { PreviewTableProps } from '../contracts';
import { fmtInt } from '../../lib/format';

/**
 * STUB — replaced by Wave-2 unit "Preview + SQL". Real version renders the customer /
 * location / trade / jobs / $ / last-job / flags table with the empty + error states.
 * The stub shows a one-line status so the data wiring is visible.
 */
export function PreviewTable({ rows, audienceCount, loading, error }: PreviewTableProps) {
  return (
    <div id="previewPane">
      <div className="caption">
        <span className="dot dot-lime" />
        <span>
          {error
            ? `Error: ${error}`
            : loading
              ? 'Loading…'
              : `${fmtInt(audienceCount)} matches · showing ${rows.length} (preview table to be implemented)`}
        </span>
      </div>
    </div>
  );
}
