/**
 * Typed fetch wrappers for every API endpoint. Used by the client components; keeps
 * URL/shape knowledge in one place.
 */
import type {
  AdsEstimate,
  AudienceResponse,
  Config,
  Facets,
  FacetOption,
  FilterPayload,
  SavedAudience,
} from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  message?: string;
  count?: number;
  dryRun?: boolean;
  [k: string]: unknown;
}

export const api = {
  config: () => getJson<Config>('/api/config'),
  facets: () => getJson<Facets>('/api/facets'),
  tags: () => getJson<{ tags: FacetOption[]; error?: string }>('/api/tags'),
  audience: (payload: FilterPayload) =>
    postJson<AudienceResponse & { error?: string }>('/api/audience', payload),
  listAudiences: () => getJson<{ audiences: SavedAudience[] }>('/api/audiences'),
  saveAudience: (name: string, filters: FilterPayload) =>
    postJson<ActionResult & { audience?: SavedAudience }>('/api/audiences', { name, filters }),
  applyTag: (filters: FilterPayload, tag: string) =>
    postJson<ActionResult>('/api/tags/apply', { filters, tag }),
  adsEstimate: (filters: FilterPayload, platforms: string[]) =>
    postJson<AdsEstimate & { error?: string }>('/api/ads/estimate', { filters, platforms }),
  adsSend: (filters: FilterPayload, platform: string) =>
    postJson<ActionResult>('/api/ads/send', { filters, platform }),
};

/** Export is a binary download, so it is handled directly in the export panel, not here. */
export const EXPORT_URL = '/api/export';
