'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Collapsible filter section wrapper (ported from the `section()` accordion in app.js).
 * Sections default to collapsed; clicking the header toggles. Collapse state is local
 * to the component, so it persists naturally across re-renders.
 */
export interface SectionProps {
  label: string;
  icon?: ReactNode;
  iconLime?: boolean;
  activeCount?: number;
  defaultCollapsed?: boolean;
  style?: React.CSSProperties;
  children: ReactNode;
}

export function Section({
  label,
  icon,
  iconLime = false,
  activeCount = 0,
  defaultCollapsed = true,
  style,
  children,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={`fsection${collapsed ? ' collapsed' : ''}`} style={style}>
      <button type="button" className="fhead" onClick={() => setCollapsed((c) => !c)}>
        <span className="fhead-main">
          {icon ? <span className={`ficon${iconLime ? ' lime' : ''}`}>{icon}</span> : null}
          {label}
        </span>
        {activeCount ? <span className="fhead-cnt">{activeCount}</span> : null}
        <ChevronDown className="fchevron" size={16} />
      </button>
      <div className="fbody">{children}</div>
    </div>
  );
}
