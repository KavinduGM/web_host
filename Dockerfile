# syntax=docker/dockerfile:1.7

# ----------------------------------------------------------------------------
# Stage 1: build the React admin UI
# ----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build


# ----------------------------------------------------------------------------
# Stage 2: install server production deps
# ----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS server-deps
WORKDIR /app/server

# Build deps for better-sqlite3 (only needed if a prebuilt binary isn't available
# for this arch; it's safe to include and is dropped from the final image anyway).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund


# ----------------------------------------------------------------------------
# Stage 3: final runtime
# ----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# Runtime deps:
#   git  — to clone demo source repos
#   ca-certificates — HTTPS clone
#   tini — proper PID 1 / signal handling
#   openssh-client — for cloning private repos via SSH (optional but cheap)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      ca-certificates \
      openssh-client \
      tini \
      && rm -rf /var/lib/apt/lists/*

# Create non-root user that owns the runtime directories
RUN useradd --create-home --shell /bin/bash --uid 1001 webhost

WORKDIR /app

# Copy server code + production node_modules + built client bundle
COPY --chown=webhost:webhost server/ ./server/
COPY --from=server-deps --chown=webhost:webhost /app/server/node_modules ./server/node_modules
COPY --from=client-build --chown=webhost:webhost /app/client/dist ./client/dist

# Persistent paths — mount volumes here in Dokploy:
#   /data/demos    → built demo sites (served at /<slug>/)
#   /data/state    → SQLite db + git clone scratch space
RUN mkdir -p /data/demos/.disabled /data/state/work /data/tenants \
    && chown -R webhost:webhost /data

ENV NODE_ENV=production \
    PORT=3001 \
    BIND_HOST=0.0.0.0 \
    DEMOS_DIR=/data/demos \
    DISABLED_DIR=/data/demos/.disabled \
    WORK_DIR=/data/state/work \
    TENANTS_DIR=/data/tenants \
    DB_PATH=/data/state/data.db

USER webhost
WORKDIR /app/server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
