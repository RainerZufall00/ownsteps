# syntax=docker/dockerfile:1

# Debian instead of Alpine: better-sqlite3 and sharp ship ready-made binaries
# for glibc; on musl they would have to be compiled first.
#
# Pinned by digest, so that Dependabot opens a PR whenever the image behind
# the tag is rebuilt with new Debian or Node patches. With the bare tag it
# never does, and the patches only arrived with the next release by chance.
# All three stages must use the same digest; Dependabot updates them together.
FROM node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 ships a binding.gyp, which makes npm run
# "node-gyp rebuild" on its own – that would need Python and a compiler, which
# the slim image doesn't have. The build isn't needed: the package ships
# ready-made binaries for linux-x64/arm64, and so does sharp via @img/*.
# If a package that really needs an install script is added later, install
# "python3 make g++" here instead.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-trixie-slim@sha256:68c76cfad89921b927eae28ba21407475e29d0ce450afcdbe70c1532db042b64 AS runner
WORKDIR /app

# Debian's fixes reach the node image only when Docker Hub rebuilds it, which
# can lag days behind an advisory (zlib's CVE-2026-85091 did). So the runtime
# stage applies them itself. Only here: deps and builder don't ship.
# APT_REFRESH is set to the workflow run ID in CI and the release build. A
# changed value misses the build cache, so the GitHub Actions cache can't hand
# back an upgrade layer from weeks ago.
ARG APT_REFRESH=
RUN echo "apt refresh: ${APT_REFRESH:-none}" \
 && apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# The server only needs node. npm, npx, corepack and yarn come with the base
# image, are never run here and bring their own bundled packages along –
# the usual source of findings in image scans. Out with them.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

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
