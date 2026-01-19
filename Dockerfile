# Vibecraft Docker Image
# Multi-stage build for minimal production image

# =============================================================================
# Build Stage - Use full Node image for better compatibility
# =============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source files
COPY . .

# Build client and server
RUN npm run build

# =============================================================================
# Production Stage
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache tini

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/hooks ./hooks

# Create non-root user for security
RUN addgroup -g 1001 vibecraft && \
    adduser -u 1001 -G vibecraft -s /bin/sh -D vibecraft

# Create data directory with correct permissions
RUN mkdir -p /data && chown vibecraft:vibecraft /data

# Switch to non-root user
USER vibecraft

# Environment configuration
ENV NODE_ENV=production \
    VIBECRAFT_PORT=4003 \
    VIBECRAFT_EVENTS_FILE=/data/events.jsonl \
    VIBECRAFT_SESSIONS_FILE=/data/sessions.json \
    VIBECRAFT_TILES_FILE=/data/tiles.json

# Expose the server port
EXPOSE 4003

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:4003/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the server
CMD ["node", "dist/server/server/index.js"]
