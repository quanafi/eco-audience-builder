import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TradesSection } from './TradesSection';
import { RegionsSection } from './RegionsSection';
import { RecencySection } from './RecencySection';
import { ZipSection } from './ZipSection';
import { SpendSection } from './SpendSection';
import type { FilterSectionProps } from '../contracts';
import { emptySet } from '../../lib/editableSet';
import type { Config, Facets, FacetCounts } from '../../lib/types';

const facets: Facets = {
  baseCount: 1000,
  trades: [
    { value: 'Plumbing', count: 400 },
    { value: 'HVAC', count: 350 },
  ],
  regions: [
    { value: 'Columbus', count: 600 },
    { value: 'Dayton', count: 200 },
  ],
  segments: {},
  flags: {},
  suppressedCount: 0,
};

const config: Config = { flags: [], trades: [], regions: [], segmentGroups: [] };

function makeProps(over: Partial<FilterSectionProps> = {}): FilterSectionProps {
  return {
    set: emptySet(),
    facets,
    facetCounts: null,
    config,
    onChange: vi.fn(),
    ...over,
  };
}

// Sections render collapsed; expand by clicking the section header so the body inputs
// are interactable.
function expand(label: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('TradesSection', () => {
  it('renders trade options with base counts and fires onChange on click', () => {
    const onChange = vi.fn();
    render(<TradesSection {...makeProps({ onChange })} />);
    expand(/Trade/);

    const plumbing = screen.getByRole('button', { name: /Plumbing/ });
    expect(plumbing).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();

    fireEvent.click(plumbing);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].trades).toEqual(['Plumbing']);
  });

  it('overlays live facetCounts when present', () => {
    const facetCounts: FacetCounts = { trades: { Plumbing: 12 } };
    render(<TradesSection {...makeProps({ facetCounts })} />);
    expand(/Trade/);
    // Live count overlays the base 400; HVAC has no live entry so falls back to 350.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });
});

describe('RegionsSection', () => {
  it('renders region options and toggles selection off', () => {
    const onChange = vi.fn();
    const set = { ...emptySet(), regions: ['Columbus'] };
    render(<RegionsSection {...makeProps({ onChange, set })} />);
    expand(/Region/);

    fireEvent.click(screen.getByRole('button', { name: /Columbus/ }));
    expect(onChange.mock.calls[0][0].regions).toEqual([]);
  });
});

describe('RecencySection', () => {
  it('renders presets and fires onChange when a preset is picked', () => {
    const onChange = vi.fn();
    render(<RecencySection {...makeProps({ onChange })} />);
    expand(/Recency/);

    expect(screen.getByRole('button', { name: 'Any' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '≤ 90d' }));
    expect(onChange.mock.calls[0][0].recency).toBe('90');
  });

  it('shows the custom range inputs only when custom is selected', () => {
    const set = { ...emptySet(), recency: 'custom' };
    render(<RecencySection {...makeProps({ set })} />);
    expand(/Recency/);
    expect(screen.getByLabelText('Minimum days ago')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum days ago')).toBeInTheDocument();
  });
});

describe('ZipSection', () => {
  it('commits the typed ZIPs on blur', () => {
    const onChange = vi.fn();
    render(<ZipSection {...makeProps({ onChange })} />);
    expand(/ZIP code/);

    const input = screen.getByLabelText('ZIP codes');
    fireEvent.change(input, { target: { value: '43230, 45601' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].zips).toBe('43230, 45601');
  });

  it('shows the validity hint for non-ZIP input', () => {
    render(<ZipSection {...makeProps()} />);
    expand(/ZIP code/);
    const input = screen.getByLabelText('ZIP codes');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByText(/5-digit ZIPs/)).toBeInTheDocument();
  });
});

describe('SpendSection', () => {
  it('renders preset chips and sets spendMin on preset click', () => {
    const onChange = vi.fn();
    render(<SpendSection {...makeProps({ onChange })} />);
    expand(/Lifetime spend/);

    fireEvent.click(screen.getByRole('button', { name: '$1k+' }));
    const next = onChange.mock.calls[0][0];
    expect(next.spendPreset).toBe('$1k+');
    expect(next.spendMin).toBe(1000);
    expect(next.spendMax).toBeNull();
  });

  it('clears the preset when the min input is edited', () => {
    const onChange = vi.fn();
    const set = { ...emptySet(), spendPreset: '$1k+', spendMin: 1000 };
    render(<SpendSection {...makeProps({ onChange, set })} />);
    expand(/Lifetime spend/);

    const input = screen.getByLabelText('Minimum lifetime spend');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    const next = onChange.mock.calls[0][0];
    expect(next.spendMin).toBe(250);
    expect(next.spendPreset).toBeNull();
  });
});
