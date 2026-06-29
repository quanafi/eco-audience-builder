import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { StatsCharts } from './StatsCharts';
import type { AudienceResponse } from '../../lib/types';

// Recharts' ResponsiveContainer relies on ResizeObserver (absent in jsdom) and reads
// the container's layout box (always 0 in jsdom). Stub both so charts actually render.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 300 });
});

afterEach(() => cleanup());

const sample: AudienceResponse = {
  audienceCount: 1234,
  reachCount: 1000,
  avgValue: 2500,
  totalValue: 3085000,
  baseCount: 10000,
  pctBase: 12.34,
  rows: [],
  sql: 'SELECT 1',
  limited: false,
  facetCounts: {},
};

describe('StatsCharts', () => {
  it('renders the 4 headline metrics from a sample AudienceResponse', () => {
    render(<StatsCharts data={sample} />);
    expect(screen.getByText('1,234')).toBeInTheDocument(); // audience count
    expect(screen.getByText('12.3%')).toBeInTheDocument(); // pct of base
    expect(screen.getByText('1,000')).toBeInTheDocument(); // reach count
    expect(screen.getByText('$2,500')).toBeInTheDocument(); // avg value
    expect(screen.getByText('In audience')).toBeInTheDocument();
  });

  it('renders the chart cards when data is present', () => {
    render(<StatsCharts data={sample} />);
    expect(screen.getByText('Audience vs. customer base')).toBeInTheDocument();
    expect(screen.getByText('Reachability & value')).toBeInTheDocument();
  });

  it('renders a placeholder state when data is null', () => {
    render(<StatsCharts data={null} />);
    // Metrics fall back to em-dash; charts are replaced by the placeholder copy.
    expect(screen.getByText('Charts appear once your first audience loads.')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('Audience vs. customer base')).not.toBeInTheDocument();
  });
});
