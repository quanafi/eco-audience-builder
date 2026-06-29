'use client';

import type { SqlViewProps } from '../contracts';

/**
 * STUB — replaced by Wave-2 unit "Preview + SQL". Real version renders the highlighted,
 * copy-pasteable SQL with a copy button and SELECT-only tag. The stub shows the raw SQL.
 */
export function SqlView({ sql }: SqlViewProps) {
  return (
    <div id="sqlPane">
      <div className="sql-bar">
        <span className="sql-tag">SELECT-only · no writes</span>
      </div>
      <pre className="sql">
        <code>{sql}</code>
      </pre>
    </div>
  );
}
