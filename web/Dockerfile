# Multi-stage build producing a Next.js standalone server.
# Single process on purpose: the in-memory customer snapshot (lib/snapshot.ts) lives
# per-process, so one Node server is the analogue of the single-gunicorn-worker model.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
# Standalone output bundles only the files the server needs.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 8080
# DATABASE_URL / INSTANCE_CONNECTION_NAME provided at runtime (Cloud Run env / secret).
CMD ["node", "server.js"]
