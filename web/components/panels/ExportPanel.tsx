'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { EXPORT_URL } from '../../lib/apiClient';
import { COLUMN_CATALOG, DEFAULT_COLUMNS } from '../../lib/customerColumns';
import type { ExportPanelProps } from '../contracts';

type Format = 'csv' | 'xlsx';

/**
 * CSV/xlsx export panel (port of setupExport/doExport in static/app.js). Offers a format
 * toggle, a grouped column picker driven by COLUMN_CATALOG (defaults from DEFAULT_COLUMNS),
 * and a streamed download for the current `payload`.
 *
 * Export is a binary download, so it POSTs to EXPORT_URL directly (the typed `api` client
 * intentionally omits it — see apiClient.ts) and turns the response blob into a file.
 */

// Visual grouping of the flat COLUMN_CATALOG, mirroring EXPORT_COLUMNS in app.js. Labels
// come from the catalog headers; defaults from DEFAULT_COLUMNS so the two never drift.
const COLUMN_GROUPS: { group: string; keys: string[] }[] = [
  { group: 'Identity', keys: ['customer_id', 'name'] },
  { group: 'Contact', keys: ['email', 'phone_number'] },
  { group: 'Location', keys: ['city', 'state', 'zip', 'address'] },
  {
    group: 'Activity',
    keys: ['primary_trade', 'lifetime_jobs', 'lifetime_revenue', 'last_completed_job', 'days_since_last_job', 'job_tags'],
  },
  { group: 'Segments', keys: ['lifetime_revenue_segment', 'frequency_segment', 'paid_recency_segment'] },
  { group: 'Flags', keys: ['is_member', 'is_repeat_customer', 'has_email', 'has_mobile'] },
];

export function ExportPanel({ payload }: ExportPanelProps) {
  const [format, setFormat] = useState<Format>('csv');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_COLUMNS));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const toggleColumn = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const doExport = async (close: () => void) => {
    // Preserve catalog order so the file's columns are deterministic.
    const columns = Object.keys(COLUMN_CATALOG).filter((k) => selected.has(k));
    if (!columns.length) {
      setNote('Pick at least one column.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(EXPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: payload, columns, format }),
      });
      if (!res.ok) {
        let msg = 'Export failed';
        try {
          const j = await res.json();
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON error body */
        }
        setNote(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `audience-${stamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      // Defer cleanup: revoking synchronously after click() aborts the download in
      // Chrome/Firefox before the file is written.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 2000);
      close();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropdown label="Export" icon={<Download size={15} />}>
      {(close) => (
        <>
          <div className="export-head">Export audience</div>
          <div className="export-row">
            <span className="export-lbl">Format</span>
            <div className="export-fmt">
              <label>
                <input
                  type="radio"
                  name="expfmt"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                />{' '}
                CSV
              </label>
              <label>
                <input
                  type="radio"
                  name="expfmt"
                  value="xlsx"
                  checked={format === 'xlsx'}
                  onChange={() => setFormat('xlsx')}
                />{' '}
                Excel
              </label>
            </div>
          </div>
          <div className="export-row export-row-cols">
            <span className="export-lbl">Columns</span>
            <div className="export-cols">
              {COLUMN_GROUPS.map(({ group, keys }) => (
                <div className="export-grp" key={group}>
                  <div className="export-grp-lbl">{group}</div>
                  {keys.map((key) => (
                    <label className="export-col" key={key}>
                      <input
                        type="checkbox"
                        value={key}
                        checked={selected.has(key)}
                        onChange={() => toggleColumn(key)}
                      />
                      {COLUMN_CATALOG[key].header}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="export-foot">
            <span className="export-note">{note}</span>
            <button
              type="button"
              className="btn-download"
              disabled={busy}
              onClick={() => doExport(close)}
            >
              {busy ? 'Preparing…' : 'Download'}
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
