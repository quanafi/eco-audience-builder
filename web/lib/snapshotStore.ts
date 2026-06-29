/**
 * Process-wide snapshot singleton + daily refresh (port of the module globals and
 * start_background_refresh in app/snapshot.py).
 *
 * The snapshot lives in module state, so it must live in ONE Node process — the Docker
 * image runs a single `next start` server, the analogue of the single-gunicorn-worker
 * model. Every query path (facets, tags, audience filtering) reads from here.
 *
 * It also registers the tag-vocabulary source: audienceQuery validates tag filters
 * against the current snapshot's tag index (inversion of the Python `_valid_tags` DB
 * query into a provider, avoiding an import cycle).
 */
import { setTagVocabProvider } from './audienceQuery';
import { REFRESH_MS, Snapshot } from './snapshot';

let _snapshot: Snapshot | null = null;
let _building: Promise<Snapshot> | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;

// Tag filters are validated against the current snapshot's tag index.
setTagVocabProvider(() => (_snapshot ? _snapshot.tagValues() : new Set<string>()));

/** Return the current snapshot, building it on first use (one build at a time). */
export async function getSnapshot(): Promise<Snapshot> {
  if (_snapshot) return _snapshot;
  if (!_building) {
    _building = Snapshot.fromWarehouse()
      .then((s) => {
        _snapshot = s;
        _building = null;
        return s;
      })
      .catch((e) => {
        _building = null; // allow a retry on the next request
        throw e;
      });
  }
  return _building;
}

/** Rebuild the snapshot and swap it in atomically (the old one stays live until the
 * new one is ready, so in-flight requests never see a partial snapshot). */
export async function refresh(): Promise<void> {
  const next = await Snapshot.fromWarehouse();
  _snapshot = next;
}

/** Build the snapshot now and schedule a daily rebuild. Best-effort: a failed
 * build/refresh is logged and swallowed so the web process still serves. */
export function startBackgroundRefresh(intervalMs: number = REFRESH_MS): void {
  if (_timer) return;
  getSnapshot().catch((e) =>
    console.error('Initial snapshot build failed; will retry on first request', e),
  );
  _timer = setInterval(() => {
    refresh().catch((e) =>
      console.error('Snapshot background refresh failed; keeping the previous snapshot', e),
    );
  }, intervalMs);
  // Don't hold the event loop open solely for the refresh timer.
  if (typeof (_timer as { unref?: () => void }).unref === 'function') {
    (_timer as { unref: () => void }).unref();
  }
}

/** Test seam: inject a prebuilt snapshot (mirrors monkeypatching get_snapshot). */
export function __setSnapshotForTest(s: Snapshot | null): void {
  _snapshot = s;
  _building = null;
}
