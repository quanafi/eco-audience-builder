/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build so the Docker image runs a single Node process (`node server.js`).
  // The in-memory customer snapshot (lib/snapshot.ts) lives in module state, so it must
  // live in ONE process — exactly the single-gunicorn-worker model the Flask app used.
  output: 'standalone',
  reactStrictMode: true,
  // pg / pg-cursor / exceljs are server-only native-ish deps; keep them external so Next
  // never tries to bundle them into a route's serverless chunk.
  experimental: {
    serverComponentsExternalPackages: ['pg', 'pg-cursor', 'exceljs'],
    // Run instrumentation.ts register() at server startup (builds the snapshot).
    instrumentationHook: true,
  },
};

export default nextConfig;
