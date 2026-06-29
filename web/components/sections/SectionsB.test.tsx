import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentsSection } from './SegmentsSection';
import { FlagsSection } from './FlagsSection';
import { TagsSection } from './TagsSection';
import { emptySet, type EditableSet } from '../../lib/editableSet';
import type { Config, Facets, FacetCounts } from '../../lib/types';
import type { FilterSectionProps } from '../contracts';

const facets: Facets = {
  baseCount: 1000,
  trades: [],
  regions: [],
  segments: {
    revenueSegments: [
      { value: '1. High', count: 120 },
      { value: '2. Low', count: 80 },
    ],
    frequencySegments: [{ value: 'Frequent', count: 200 }],
    recencySegments: [],
  },
  flags: { is_member: 300, has_email: 700 },
  suppressedCount: 0,
  tags: [
    { value: 'Water Heater', count: 50 },
    { value: 'Furnace Tune-Up', count: 30 },
    { value: 'Drain Cleaning', count: 25 },
  ],
};

const facetCounts: FacetCounts = {
  revenueSegments: { '1. High': 99 },
  flags: { is_member: 250 },
  tags: { 'Water Heater': 42 },
};

const config: Config = {
  flags: [
    { f: 'is_member', label: 'EcoFi member' },
    { f: 'has_email', label: 'Has email' },
  ],
  trades: [],
  regions: [],
  segmentGroups: [
    { key: 'revenueSegments', label: 'Lifetime revenue tier' },
    { key: 'frequencySegments', label: 'Visit frequency' },
    { key: 'recencySegments', label: 'Paid recency' },
  ],
};

function props(over: Partial<FilterSectionProps> = {}): FilterSectionProps {
  return {
    set: emptySet(),
    facets,
    facetCounts,
    config,
    onChange: vi.fn(),
    ...over,
  };
}

// Sections render collapsed; expand by clicking the header so the body is interactive.
function expand(label: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
}

describe('SegmentsSection', () => {
  it('renders each non-empty segment group with options + live counts', () => {
    render(<SegmentsSection {...props()} />);
    expand('Segments');
    expect(screen.getByText('Lifetime revenue tier')).toBeInTheDocument();
    expect(screen.getByText('Visit frequency')).toBeInTheDocument();
    // empty group (recencySegments) is omitted
    expect(screen.queryByText('Paid recency')).not.toBeInTheDocument();
    // ordinal prefix stripped by segLabel
    expect(screen.getByText('High')).toBeInTheDocument();
    // live count overlays the base count (99, not 120)
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('calls onChange with the toggled segment value', () => {
    const onChange = vi.fn();
    render(<SegmentsSection {...props({ onChange })} />);
    expand('Segments');
    fireEvent.click(screen.getByText('High'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EditableSet;
    expect(next.revenueSegments).toEqual(['1. High']);
  });
});

describe('FlagsSection', () => {
  it('renders flag chips from config and toggles via onChange', () => {
    const onChange = vi.fn();
    render(<FlagsSection {...props({ onChange })} />);
    expand('Reachability');
    expect(screen.getByText('EcoFi member')).toBeInTheDocument();
    // live count shown where available
    expect(screen.getByText('250')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Has email'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EditableSet;
    expect(next.flags).toEqual(['has_email']);
  });
});

describe('TagsSection', () => {
  it('renders the tag list and toggles a tag via onChange', () => {
    const onChange = vi.fn();
    render(<TagsSection {...props({ onChange })} />);
    expand('Job tags');
    expect(screen.getByText('Water Heater')).toBeInTheDocument();
    // live count overlay (42, not 50)
    expect(screen.getByText('42')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Water Heater'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EditableSet;
    expect(next.tags).toEqual(['Water Heater']);
  });

  it('filters the list in place via the search box (non-matches hidden)', () => {
    render(<TagsSection {...props()} />);
    expand('Job tags');
    const input = screen.getByPlaceholderText(/Search 3 tags/);
    fireEvent.change(input, { target: { value: 'furnace' } });
    // matching option stays visible
    expect(screen.getByText('Furnace Tune-Up').closest('button')).not.toHaveAttribute('hidden');
    // non-matching options are hidden (kept mounted to preserve scroll)
    expect(screen.getByText('Water Heater').closest('button')).toHaveAttribute('hidden');
    expect(screen.getByText('Drain Cleaning').closest('button')).toHaveAttribute('hidden');
  });

  it('shows a loading state until the tag universe resolves', () => {
    render(<TagsSection {...props({ facets: { ...facets, tags: undefined } })} />);
    expand('Job tags');
    expect(screen.getByPlaceholderText('Loading tags…')).toBeDisabled();
  });

  it('renders selected tags as removable chips', () => {
    const onChange = vi.fn();
    const set: EditableSet = { ...emptySet(), tags: ['Water Heater'] };
    render(<TagsSection {...props({ set, onChange })} />);
    expand('Job tags');
    // removable chip carries the × affordance
    const chip = screen.getAllByText('Water Heater')[0].closest('button')!;
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0] as EditableSet).tags).toEqual([]);
  });
});
