'use client';

import { Bookmark } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import type { SavePanelProps } from '../contracts';

/**
 * STUB — replaced by Wave-2 unit "Action panels A". Real version saves the current
 * segment and lists saved audiences (loading one calls `onLoad`). Honors SavePanelProps.
 */
export function SavePanel(_props: SavePanelProps) {
  return (
    <Dropdown label="Saved" icon={<Bookmark size={15} />}>
      {() => <div className="hint">Save / load audiences — to be implemented (Action panels A).</div>}
    </Dropdown>
  );
}
