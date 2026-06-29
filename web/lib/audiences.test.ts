/**
 * Tests for the saved-audiences mock store + route (port of the saved-audience
 * cases in tests/test_endpoints.py: seeded list, POST appends and returns the
 * record, blank name defaults to "Untitled audience").
 */
import { describe, it, expect } from 'vitest';
import { listAudiences, saveAudience } from './audiences';
import { GET, POST } from '@/app/api/audiences/route';
import type { NextRequest } from 'next/server';

const postReq = (body: unknown): NextRequest =>
  ({ json: async () => body }) as unknown as NextRequest;

describe('audiences store', () => {
  it('seeds the 3 sample audiences', () => {
    const list = listAudiences();
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        'sample-lapsed-plumbing-columbus',
        'sample-highvalue-hvac-members',
        'sample-reachable-repeat',
      ]),
    );
  });

  it('each sample has the full SavedAudience shape', () => {
    const sample = listAudiences().find((a) => a.id === 'sample-lapsed-plumbing-columbus')!;
    expect(sample.name).toBe('Lapsed Plumbing — Columbus');
    expect(sample.createdAt).toBe('2026-06-01T00:00:00Z');
    expect(sample.filters.mode).toBe('include');
    expect(sample.filters.trades).toEqual(['Plumbing']);
    expect(sample.filters.regions).toEqual(['Columbus']);
    expect(sample.filters.recencyMin).toBe(365);
    expect(sample.filters.flags).toEqual(['has_email']);
    // _filters defaults: nested exclude set + empty include defaults present.
    expect(sample.filters.exclude).toBeDefined();
    expect(sample.filters.exclude?.trades).toEqual([]);
    expect(sample.filters.zips).toBe('');
  });

  it('listAudiences returns clones — callers cannot mutate the store', () => {
    const first = listAudiences();
    first[0].name = 'mutated';
    first[0].filters.trades = ['HACKED'];
    const second = listAudiences();
    expect(second[0].name).not.toBe('mutated');
    expect(second[0].filters.trades).not.toContain('HACKED');
  });

  it('saveAudience appends and returns the created record', () => {
    const before = listAudiences().length;
    const result = saveAudience('My audience', { trades: ['HVAC'], mode: 'include' });
    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^local-\d+$/);
    expect(result.audience.name).toBe('My audience');
    expect(result.audience.filters.trades).toEqual(['HVAC']);
    expect(result.audience.createdAt).toBeNull();
    expect(result.message).toContain('My audience');

    const after = listAudiences();
    expect(after.length).toBe(before + 1);
    expect(after.some((a) => a.id === result.id)).toBe(true);
  });

  it('defaults a blank name to "Untitled audience"', () => {
    expect(saveAudience('  ', {}).audience.name).toBe('Untitled audience');
    expect(saveAudience('', {}).audience.name).toBe('Untitled audience');
  });

  it('generates unique ids on successive saves', () => {
    const a = saveAudience('a', {});
    const b = saveAudience('b', {});
    expect(a.id).not.toBe(b.id);
  });
});

describe('GET /api/audiences', () => {
  it('returns the seeded list', async () => {
    const res = await GET();
    const data = await res.json();
    expect(Array.isArray(data.audiences)).toBe(true);
    expect(data.audiences.length).toBeGreaterThanOrEqual(3);
  });
});

describe('POST /api/audiences', () => {
  it('appends and returns the record (blank name defaulted)', async () => {
    const res = await POST(postReq({ name: '  ', filters: { trades: ['HVAC'] } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.audience.name).toBe('Untitled audience');
    expect(data.audience.filters.trades).toEqual(['HVAC']);
  });

  it('rejects a non-string name with 400', async () => {
    const res = await POST(postReq({ name: 123 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('rejects a non-object filters with 400', async () => {
    const res = await POST(postReq({ name: 'x', filters: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const res = await POST(postReq([1, 2, 3]));
    expect(res.status).toBe(400);
  });

  it('treats a malformed JSON body as empty → defaults name', async () => {
    const badReq = {
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as NextRequest;
    const res = await POST(badReq);
    expect(res.status).toBe(200);
    expect((await res.json()).audience.name).toBe('Untitled audience');
  });
});
