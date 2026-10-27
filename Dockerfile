# Use the same libc and Node version for native dependencies and runtime.
FROM node:24.22.1-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 can compile when no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json .npmrc ./
COPY bin/ ./bin/
RUN HUSKY=0 npm ci

COPY scripts/ ./scripts/
COPY client/ ./client/
COPY src/ ./src/
COPY public/ ./public/
COPY drizzle/ ./drizzle/
COPY tsconfig.json tsconfig.build.json tsup.config.ts ./
RUN npm run build
# Do not rerun prepare (Husky) after removing development dependencies.
RUN npm prune --omit=dev --ignore-scripts

FROM node:24.22.1-bookworm-slim AS production
WORKDIR /moartube-node

ENV NODE_ENV=production \
    IS_DOCKER_ENVIRONMENT=true

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --create-home moartube \
    && mkdir /data && chown moartube:nodejs /data

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/bin ./bin/
# The build includes the generated player, public assets, and DB migrations.
COPY --from=builder /app/dist ./dist/

USER moartube:nodejs
EXPOSE 9090
VOLUME /data

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:9090/status/heartbeat', {signal: AbortSignal.timeout(5000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/moartube-node.js"]
