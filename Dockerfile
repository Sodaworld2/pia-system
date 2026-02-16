# ============================================================
# PIA System - Multi-stage Docker Build
# ============================================================
# Stage 1: Builder - compile TypeScript and native dependencies
# Stage 2: Runtime - minimal image for production
# ============================================================

# ----------------------------------------------------------
# Stage 1: Builder
# ----------------------------------------------------------
FROM node:20-alpine AS builder

# Install build dependencies for native modules (better-sqlite3, node-pty)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev

WORKDIR /app

# Copy package manifests first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and TypeScript config
COPY src/ ./src/
COPY tsconfig.json ./

# Copy public assets
COPY public/ ./public/

# Build TypeScript to JavaScript
RUN npm run build

# ----------------------------------------------------------
# Stage 2: Runtime
# ----------------------------------------------------------
FROM node:20-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    sqlite-dev

WORKDIR /app

# Copy built output from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Copy and set up entrypoint script
COPY docker-entry.sh ./docker-entry.sh
RUN chmod +x ./docker-entry.sh

# Environment variables
ENV PIA_MODE=hub
ENV PIA_HOST=0.0.0.0
ENV PIA_PORT=3000
ENV PIA_WS_PORT=3001
ENV PIA_DB_PATH=/app/data/pia.db
ENV PIA_NO_BROWSER=1

# Expose HTTP and WebSocket ports
EXPOSE 3000 3001

# Persistent data volume
VOLUME /app/data

# Use entrypoint script
ENTRYPOINT ["./docker-entry.sh"]
