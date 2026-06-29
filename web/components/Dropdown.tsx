'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Card-action dropdown (Saved / Tag / Export / Send-to-Ads). Ported from the
 * setupDropdown helper in app.js: a fixed-position panel anchored under the trigger
 * (fixed so the card's overflow:hidden never clips it), closed on outside-click/Escape,
 * repositioned on scroll/resize. `children` is a render prop receiving a `close` fn so a
 * panel can dismiss itself after an action.
 */
export interface DropdownProps {
  label: string;
  icon?: ReactNode;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}

export function Dropdown({ label, icon, onOpen, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      if (next) onOpen?.();
      return next;
    });

  return (
    <div className="export-wrap" ref={wrapRef}>
      <button type="button" className="btn-export" onClick={toggle}>
        {icon}
        {label}
      </button>
      {open ? (
        <div className="export-panel" ref={panelRef} style={{ top: pos.top, right: pos.right }}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
