import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewTable } from './PreviewTable';
import { SqlView } from './SqlView';
import type { PreviewRow } from '../../lib/types';

const SAMPLE_ROWS: PreviewRow[] = [
  {
    customer_id: 101,
    name: 'Acme Plumbing',
    city: 'Austin',
    zip: '78701',
    state: 'TX',
    primary_trade: 'Plumbing',
    lifetime_jobs: 12,
    lifetime_revenue: 8450,
    last_completed_job: '2026-03-01',
    days_since_last_job: 40,
    segment: '1. High value',
    is_member: true,
    has_email: true,
    has_mobile: true,
    is_repeat_customer: true,
  },
  {
    customer_id: 102,
    name: 'Beta HVAC',
    city: 'Dallas',
    zip: '75201',
    state: 'TX',
    primary_trade: 'HVAC',
    lifetime_jobs: 3,
    lifetime_revenue: 1200,
    last_completed_job: null,
    days_since_last_job: null,
    segment: '2. Mid value',
    is_member: false,
    has_email: false,
    has_mobile: false,
    is_repeat_customer: false,
  },
];

const SAMPLE_SQL = `-- audience query
SELECT customer_id, name
FROM edw2.customers
WHERE lifetime_revenue > 1000
ORDER BY lifetime_revenue DESC`;

describe('PreviewTable', () => {
  it('renders a row per customer with key fields', () => {
    render(<PreviewTable rows={SAMPLE_ROWS} audienceCount={2} loading={false} error={null} />);
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Beta HVAC')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('$8,450')).toBeInTheDocument();
    // EcoFi flag shows only for the member row.
    expect(screen.getAllByText('EcoFi')).toHaveLength(1);
  });

  it('shows a "top N of M" caption when the audience is larger than the preview', () => {
    render(<PreviewTable rows={SAMPLE_ROWS} audienceCount={500} loading={false} error={null} />);
    expect(screen.getByText(/Showing top 2 of 500 matches/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    render(<PreviewTable rows={[]} audienceCount={0} loading={false} error={null} />);
    expect(screen.getByText('No customers match these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error state when an error is present', () => {
    render(<PreviewTable rows={[]} audienceCount={0} loading={false} error="boom" />);
    expect(screen.getByText('Query error')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('shows a loading caption while loading', () => {
    render(<PreviewTable rows={[]} audienceCount={0} loading={true} error={null} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('SqlView', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the SQL text and the SELECT-only tag', () => {
    render(<SqlView sql={SAMPLE_SQL} />);
    expect(screen.getByText(/SELECT-only/)).toBeInTheDocument();
    // Tokenized text is split across spans; assert a couple of tokens are present.
    expect(screen.getByText('SELECT')).toBeInTheDocument();
    expect(screen.getByText('edw2')).toBeInTheDocument();
  });

  it('has a copy button that writes the SQL to the clipboard', async () => {
    render(<SqlView sql={SAMPLE_SQL} />);
    const btn = screen.getByRole('button', { name: /copy sql/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SAMPLE_SQL);
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });
});
