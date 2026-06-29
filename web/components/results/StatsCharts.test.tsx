import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { StatsCharts } from './StatsCharts';
import type { AudienceResponse } from '../../lib/types';

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

  it('renders em-dash metrics when data is null', () => {
    render(<StatsCharts data={null} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText('In audience')).toBeInTheDocument();
  });
});
