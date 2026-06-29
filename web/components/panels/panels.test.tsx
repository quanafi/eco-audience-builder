import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SavePanel } from './SavePanel';
import { TagPanel } from './TagPanel';
import type { FilterPayload, SavedAudience } from '../../lib/types';

// Mock the typed API client — these panels must go through it, not hand-rolled fetch.
vi.mock('../../lib/apiClient', () => ({
  api: {
    listAudiences: vi.fn(),
    saveAudience: vi.fn(),
    applyTag: vi.fn(),
  },
}));

import { api } from '../../lib/apiClient';

const payload: FilterPayload = { trades: ['HVAC'], mode: 'include' };

const SAVED: SavedAudience[] = [
  { id: 'a1', name: 'Spring HVAC', filters: { trades: ['HVAC'] }, createdAt: null },
  { id: 'a2', name: 'Repeat customers', filters: { flags: ['is_repeat'] }, createdAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SavePanel', () => {
  it('lists saved audiences on open and fires onLoad with the saved filters', async () => {
    vi.mocked(api.listAudiences).mockResolvedValue({ audiences: SAVED });
    const onLoad = vi.fn();
    render(<SavePanel payload={payload} onLoad={onLoad} />);

    fireEvent.click(screen.getByRole('button', { name: /saved/i }));

    const item = await screen.findByText('Spring HVAC');
    expect(api.listAudiences).toHaveBeenCalled();

    fireEvent.click(item);
    expect(onLoad).toHaveBeenCalledWith(SAVED[0].filters);
  });

  it('saves the current segment via the api client', async () => {
    vi.mocked(api.listAudiences).mockResolvedValue({ audiences: [] });
    vi.mocked(api.saveAudience).mockResolvedValue({ ok: true, message: 'Saved.' });
    render(<SavePanel payload={payload} onLoad={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /saved/i }));
    const input = await screen.findByPlaceholderText(/name this audience/i);
    fireEvent.change(input, { target: { value: 'My segment' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(api.saveAudience).toHaveBeenCalledWith('My segment', payload));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('does not call the api client when the name is empty', async () => {
    vi.mocked(api.listAudiences).mockResolvedValue({ audiences: [] });
    render(<SavePanel payload={payload} onLoad={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /saved/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^save$/i }));

    expect(api.saveAudience).not.toHaveBeenCalled();
    expect(screen.getByText(/name this audience first/i)).toBeInTheDocument();
  });
});

describe('TagPanel', () => {
  it('applies a tag through the api client and shows the result', async () => {
    vi.mocked(api.applyTag).mockResolvedValue({ ok: true, message: 'Tagged 5 customers (dry-run).' });
    render(<TagPanel payload={payload} lastCount={5} />);

    fireEvent.click(screen.getByRole('button', { name: /^tag$/i }));
    expect(screen.getByText(/will tag 5 matching customers/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/spring 2026 campaign/i);
    fireEvent.change(input, { target: { value: 'Campaign A' } });
    fireEvent.click(screen.getByRole('button', { name: /apply tag/i }));

    await waitFor(() => expect(api.applyTag).toHaveBeenCalledWith(payload, 'Campaign A'));
    expect(await screen.findByText(/tagged 5 customers/i)).toBeInTheDocument();
  });

  it('does not call the api client when the tag is empty', () => {
    render(<TagPanel payload={payload} lastCount={null} />);

    fireEvent.click(screen.getByRole('button', { name: /^tag$/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply tag/i }));

    expect(api.applyTag).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a tag name/i)).toBeInTheDocument();
  });
});
