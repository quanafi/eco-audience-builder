'use client';

import { Send } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import type { AdsPanelProps } from '../contracts';

/**
 * STUB — replaced by Wave-2 unit "Action panels B". Real version picks a platform
 * (Google/Meta), estimates the match rate, and runs a dry-run send with a dry-run
 * badge. Honors AdsPanelProps.
 */
export function AdsPanel(_props: AdsPanelProps) {
  return (
    <Dropdown label="Send to Ads" icon={<Send size={15} />}>
      {() => <div className="hint">Estimate + dry-run send — to be implemented (Action panels B).</div>}
    </Dropdown>
  );
}
