# Single stage: db:migrate and import-legacy need drizzle-kit and tsx at runtime,
# so there is nothing to gain from a slimmed standalone-only runner image.
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Every workspace manifest, so --frozen-lockfile matches the lockfile importers.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/simple/package.json apps/simple/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/blob-storage/package.json packages/blob-storage/
COPY packages/common/package.json packages/common/
COPY packages/database/package.json packages/database/
COPY packages/events/package.json packages/events/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/sharing/package.json packages/sharing/
COPY services/ingestion-worker/package.json services/ingestion-worker/

RUN echo "shamefully-hoist=true" > .npmrc && \
    pnpm install --filter simple --frozen-lockfile

COPY apps/simple/ apps/simple/
RUN pnpm --filter simple build

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME="0.0.0.0"
WORKDIR /app/apps/simple
EXPOSE 3000
# hkb:seed is an idempotent upsert of the in-code catalog (conditions, evidence,
# interventions); it runs on every start so a catalog change ships with the code.
CMD ["sh", "-c", "pnpm db:migrate && pnpm import-legacy && (pnpm hkb:seed || echo hkb:seed failed) && pnpm exec next start -p 3000"]
