/**
 * Next.js instrumentation hook — runs once when the server process starts (the
 * analogue of the Flask app's startup snapshot thread in app/server.py). Builds the
 * in-memory snapshot now and schedules a daily rebuild. Best-effort: a failed build is
 * logged and retried lazily on the first request, so the server still starts without a
 * reachable warehouse.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundRefresh } = await import('./lib/snapshotStore');
    startBackgroundRefresh();
  }
}
