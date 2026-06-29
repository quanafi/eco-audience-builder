'use client';

import { useCallback, useState } from 'react';
import { Tag } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { api } from '../../lib/apiClient';
import { fmtInt } from '../../lib/format';
import type { TagPanelProps } from '../contracts';

/**
 * ServiceTitan tag write-back (port of setupTag/doApplyTag in static/app.js). Applies a
 * tag to the full matched audience and shows the server's dry-run result.
 *
 * PROTOTYPE: the server logs the ServiceTitan payload instead of calling the API.
 */
type Note = { msg: string; ok: boolean } | null;

export function TagPanel({ payload, lastCount }: TagPanelProps) {
  const [tag, setTag] = useState('');
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const doApply = useCallback(async () => {
    const trimmed = tag.trim();
    if (!trimmed) {
      setNote({ msg: 'Enter a tag name.', ok: false });
      return;
    }
    setApplying(true);
    setNote(null);
    try {
      const data = await api.applyTag(payload, trimmed);
      setNote({ msg: data.error || data.message || 'Done.', ok: !data.error });
    } catch (e) {
      setNote({ msg: String(e), ok: false });
    } finally {
      setApplying(false);
    }
  }, [tag, payload]);

  const target =
    lastCount != null
      ? `Will tag ${fmtInt(lastCount)} matching ${lastCount === 1 ? 'customer' : 'customers'} in ServiceTitan.`
      : '';

  return (
    <Dropdown label="Tag" icon={<Tag size={15} />}>
      {() => (
        <>
          <div className="export-head">Tag in ServiceTitan</div>
          <div className="export-row">
            <span className="export-lbl">Tag name</span>
            <input
              className="fin"
              type="text"
              autoComplete="off"
              placeholder="e.g. Spring 2026 Campaign"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doApply();
              }}
            />
          </div>
          {target ? <div className="tagst-target">{target}</div> : null}
          <div className="export-foot">
            <span className={note?.ok ? 'export-note ok' : 'export-note'}>{note?.msg ?? ''}</span>
            <button type="button" className="btn-download" onClick={doApply} disabled={applying}>
              {applying ? 'Applying…' : 'Apply tag'}
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
