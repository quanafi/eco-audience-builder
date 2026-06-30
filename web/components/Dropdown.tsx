'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Send focus into the dialog when it closes, so a keyboard user lands on the
  // trigger again instead of being dumped at the top of the document. Mouse-driven
  // closes (clicking another control on the page) should leave focus where the user
  // put it, so we only restore when focus is still inside the panel at close time.
  const restoreFocusToTrigger = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    place();
    // Move focus into the panel on open: the first focusable control, falling back
    // to the panel itself (which is tabIndex={-1}) so screen-reader/keyboard users
    // start inside the dialog they just opened.
    const first = panelRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panelRef.current)?.focus();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreFocusToTrigger();
        setOpen(false);
      }
    };

    // The scroll listener is capture-phase, so it fires for every scrollable
    // ancestor on every scroll event — and `place` forces layout (getBoundingClientRect)
    // then re-renders (setPos). Running that synchronously per event thrashes layout.
    // Coalesce bursts so the panel is repositioned at most once per animation frame.
    let rafId = 0;
    const schedulePlace = () => {
      if (rafId) return; // a frame is already pending; it will use the latest layout
      rafId = requestAnimationFrame(() => {
        rafId = 0; // clear before placing so the next event can schedule a fresh frame
        place();
      });
    };

    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, restoreFocusToTrigger]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      if (next) onOpen?.();
      return next;
    });

  return (
    <div className="export-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn-export"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        {icon}
        {label}
      </button>
      {open ? (
        <div
          className="export-panel"
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          style={{ top: pos.top, right: pos.right }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
