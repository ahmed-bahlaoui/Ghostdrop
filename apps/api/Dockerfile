# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable

# RUN npm install -g pnpm

# Copy only what's needed for the build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api ./apps/api

# Install ALL dependencies (including devDeps for building)
RUN pnpm install --filter api...

# Build the API
WORKDIR /app/apps/api
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-slim
WORKDIR /app/apps/api

# Install tini for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends tini curl && \
    rm -rf /var/lib/apt/lists/*

# Copy only the compiled code and package.json
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/src/db/migrations ./dist/db/migrations
COPY --from=builder /app/apps/api/package.json ./package.json

# Install ONLY production dependencies here (no symlinks)
RUN npm install --omit=dev

# Ensure production environment
ENV NODE_ENV=production
ENV PORT=3100

EXPOSE 3100

# Run as non-root
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Start the app with tini for signal forwarding
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "prod"]
