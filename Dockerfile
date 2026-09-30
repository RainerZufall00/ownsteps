# syntax=docker/dockerfile:1

# Debian instead of Alpine: better-sqlite3 and sharp ship ready-made binaries
# for glibc; on musl they would have to be compiled first.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 ships a binding.gyp, which makes npm run
# "node-gyp rebuild" on its own – that would need Python and a compiler, which
# the slim image doesn't have. The build isn't needed: the package ships
# ready-made binaries for linux-x64/arm64, and so does sharp via @img/*.
# If a package that really needs an install script is added later, install
# "python3 make g++" here instead.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=2555 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# The standalone build only contains the modules actually needed.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.js ./

RUN mkdir -p /data/uploads && chown -R node:node /data /app

# Deliberately no "USER node": the entrypoint briefly needs root to take
# ownership of the mounted data directory and then switches to the node user
# by itself. The server process therefore runs unprivileged.
EXPOSE 2555

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2555/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.js"]
