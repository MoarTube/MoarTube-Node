# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json tsconfig.build.json tsup.config.ts ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /moartube-node

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy public assets and other required files
COPY public/ ./public/
COPY drizzle/ ./drizzle/

# Set environment variables
ENV NODE_ENV=production
ENV IS_DOCKER_ENVIRONMENT=true

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S moartube -u 1001

# Create data directory and set permissions
RUN mkdir -p /data && chown -R moartube:nodejs /data /moartube-node

# Switch to non-root user
USER moartube

# Expose node port
EXPOSE 80

# Create the volume for persistent data
VOLUME /data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:80/status/heartbeat', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the node
CMD [ "node", "dist/moartube-node.js" ]