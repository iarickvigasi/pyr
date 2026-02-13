# ── Stage 1: Base ──
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Stage 2: Dependencies ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @pyr/frontend --filter @pyr/shared

# ── Stage 3: Build ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/frontend/node_modules ./packages/frontend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
RUN pnpm --filter @pyr/shared build
RUN pnpm --filter @pyr/frontend build

# ── Stage 4: Runner ──
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 pyr && adduser --system --uid 1001 pyr
WORKDIR /app

COPY --from=builder /app/packages/frontend/.next/standalone ./
COPY --from=builder /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder /app/packages/frontend/public ./packages/frontend/public

USER pyr
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "packages/frontend/server.js"]
