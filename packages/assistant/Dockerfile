# ── Stage 1: Base ──
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Stage 2: Dependencies ──
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/assistant/package.json ./packages/assistant/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @pyr/assistant --filter @pyr/shared

# ── Stage 3: Build ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/assistant/node_modules ./packages/assistant/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/assistant ./packages/assistant
RUN pnpm --filter @pyr/shared build
RUN pnpm --filter @pyr/assistant build

# ── Stage 4: Production deps ──
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/assistant/package.json ./packages/assistant/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter @pyr/assistant --filter @pyr/shared

# ── Stage 5: Runner ──
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 pyr && adduser --system --uid 1001 pyr
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/assistant/node_modules ./packages/assistant/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/assistant/dist ./packages/assistant/dist
COPY --from=build /app/packages/assistant/package.json ./packages/assistant/

USER pyr
WORKDIR /app/packages/assistant
CMD ["node", "dist/index.js"]
