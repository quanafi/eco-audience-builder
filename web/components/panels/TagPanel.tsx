'use client';

import { Tag } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import type { TagPanelProps } from '../contracts';

/**
 * STUB — replaced by Wave-2 unit "Action panels A". Real version applies a ServiceTitan
 * tag to the full matched audience (mock dry-run). Honors TagPanelProps.
 */
export function TagPanel(_props: TagPanelProps) {
  return (
    <Dropdown label="Tag" icon={<Tag size={15} />}>
      {() => <div className="hint">ServiceTitan tag apply — to be implemented (Action panels A).</div>}
    </Dropdown>
  );
}
