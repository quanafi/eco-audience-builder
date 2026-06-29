'use client';

import { Download } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import type { ExportPanelProps } from '../contracts';

/**
 * STUB — replaced by Wave-2 unit "Action panels B". Real version offers CSV/xlsx format,
 * a column picker (EXPORT_COLUMNS), and a streamed download. Honors ExportPanelProps.
 */
export function ExportPanel(_props: ExportPanelProps) {
  return (
    <Dropdown label="Export" icon={<Download size={15} />}>
      {() => <div className="hint">Format + column picker + download — to be implemented (Action panels B).</div>}
    </Dropdown>
  );
}
