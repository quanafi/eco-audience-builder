import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PreviewTable } from './PreviewTable';
import type { PreviewRow } from '../../lib/types';

afterEach(() => cleanup());

function row(overrides: Partial<PreviewRow>): PreviewRow {
  return {
    customer_id: 1,
    name: 'Customer',
    city: 'Columbus',
    zip: '43215',
    state: 'OH',
    primary_trade: 'plumbing',
    lifetime_jobs: 1,
    lifetime_revenue: 100,
    last_completed_job: '2026-01-01',
    days_since_last_job: 10,
    segment: '',
    is_member: false,
    has_email: false,
    has_mobile: false,
    is_repeat_customer: false,
    ...overrides,
  };
}

const rows: PreviewRow[] = [
  row({ customer_id: 1, name: 'Bravo', lifetime_revenue: 200, days_since_last_job: 5 }),
  row({ customer_id: 2, name: 'Alpha', lifetime_revenue: 300, days_since_last_job: null }),
  row({ customer_id: 3, name: 'Charlie', lifetime_revenue: 100, days_since_last_job: 20 }),
];

// `.cust-name` holds only the customer's name (the id link is a separate sibling), so
// querying it directly avoids the accessible-cell-name including both.
function names(): (string | null)[] {
  return Array.from(document.querySelectorAll('.cust-name')).map((el) => el.textContent);
}

describe('PreviewTable sorting', () => {
  it('renders rows in the given order when nothing has been clicked', () => {
    render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
  });

  it('sorts ascending on first click and descending on second click of the same header', () => {
    render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    const header = screen.getByRole('button', { name: 'Customer' });

    fireEvent.click(header);
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(header);
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('starts a newly clicked column at ascending and clears the previous column indicator', () => {
    render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    fireEvent.click(screen.getByRole('button', { name: /Lifetime \$/ }));

    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']); // ascending revenue: 100, 200, 300
    expect(screen.getByRole('button', { name: 'Customer' }).closest('th')).not.toHaveAttribute('aria-sort');
    expect(screen.getByRole('button', { name: /Lifetime \$/ }).closest('th')).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('sorts rows with no completed job to the end in both ascending and descending order', () => {
    render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    const header = screen.getByRole('button', { name: 'Last job' });

    fireEvent.click(header); // ascending
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha']); // 5, 20, null

    fireEvent.click(header); // descending
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha']); // 20, 5, null — Alpha (null) still last
  });

  it('keeps the active sort applied when the rows prop is replaced (e.g. a filter refetch)', () => {
    const { rerender } = render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customer' })); // ascending by name
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const nextRows: PreviewRow[] = [
      row({ customer_id: 4, name: 'Delta' }),
      row({ customer_id: 1, name: 'Bravo' }),
    ];
    rerender(<PreviewTable rows={nextRows} audienceCount={2} loading={false} error={null} />);

    expect(names()).toEqual(['Bravo', 'Delta']);
  });

  it('does not make the Flags column clickable', () => {
    render(<PreviewTable rows={rows} audienceCount={3} loading={false} error={null} />);
    const flagsHeader = screen.getByRole('columnheader', { name: 'Flags' });
    expect(flagsHeader.querySelector('button')).toBeNull();
  });
});
