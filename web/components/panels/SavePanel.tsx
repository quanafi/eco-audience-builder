'use client';

import { useCallback, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { api } from '../../lib/apiClient';
import type { SavePanelProps } from '../contracts';
import type { SavedAudience } from '../../lib/types';

/**
 * Save / load saved audiences (port of setupSaved/doSaveAudience/loadSavedList in
 * static/app.js). Saving POSTs the current segment name + payload; loading lists the
 * saved audiences and rehydrates the builder via `onLoad`.
 *
 * PROTOTYPE: persistence is mocked server-side; loading is real — `onLoad` fully
 * reconstructs the UI from a saved filter definition.
 */
type Note = { msg: string; ok: boolean } | null;
type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: SavedAudience[] };

export function SavePanel({ payload, onLoad }: SavePanelProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [list, setList] = useState<ListState>({ status: 'idle' });

  const loadList = useCallback(async () => {
    setList({ status: 'loading' });
    try {
      const data = await api.listAudiences();
      setList({ status: 'ready', items: data?.audiences ?? [] });
    } catch {
      setList({ status: 'error' });
    }
  }, []);

  const doSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNote({ msg: 'Name this audience first.', ok: false });
      return;
    }
    setSaving(true);
    try {
      const data = await api.saveAudience(trimmed, payload);
      if (data.error) {
        setNote({ msg: data.error, ok: false });
      } else {
        setNote({ msg: data.message || 'Saved.', ok: true });
        setName('');
        loadList();
      }
    } catch (e) {
      setNote({ msg: String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }, [name, payload, loadList]);

  return (
    <Dropdown label="Saved" icon={<Bookmark size={15} />} onOpen={loadList}>
      {(close) => (
        <>
          <div className="export-head">Saved audiences</div>
          <div className="export-row">
            <span className="export-lbl">Save current segment</span>
            <div className="save-new">
              <input
                className="fin"
                type="text"
                autoComplete="off"
                placeholder="Name this audience…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doSave();
                }}
              />
              <button type="button" className="btn-download" onClick={doSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div className="export-row">
            <span className="export-lbl">Load saved</span>
            <div className="saved-list">
              {list.status === 'loading' || list.status === 'idle' ? (
                <div className="saved-empty">Loading…</div>
              ) : list.status === 'error' ? (
                <div className="saved-empty">Could not load saved audiences.</div>
              ) : list.items.length === 0 ? (
                <div className="saved-empty">No saved audiences yet.</div>
              ) : (
                list.items.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className="saved-item"
                    onClick={() => {
                      onLoad(a.filters);
                      close();
                    }}
                  >
                    <span className="saved-name">{a.name}</span>
                    <span className="saved-meta">Load</span>
                  </button>
                ))
              )}
            </div>
          </div>
          {note ? (
            <div className="export-foot">
              <span className={note.ok ? 'export-note ok' : 'export-note'}>{note.msg}</span>
            </div>
          ) : null}
        </>
      )}
    </Dropdown>
  );
}
