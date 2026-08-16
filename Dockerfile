# syntax=docker/dockerfile:1

# Debian statt Alpine: better-sqlite3 und sharp bringen fertige Binaries für
# glibc mit, auf musl müssten sie erst kompiliert werden.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 bringt eine binding.gyp mit, worauf npm von
# sich aus "node-gyp rebuild" startet – das bräuchte Python und einen Compiler,
# die es im slim-Image nicht gibt. Nötig ist der Bau nicht: Das Paket liefert
# fertige Binaries für linux-x64/arm64 mit, sharp ebenso über @img/*.
# Kommt später ein Paket dazu, das wirklich ein install-Script braucht, muss
# hier stattdessen "python3 make g++" installiert werden.
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

# Der standalone-Build enthält nur die tatsächlich benötigten Module.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.js ./

RUN mkdir -p /data/uploads && chown -R node:node /data /app

# Bewusst kein "USER node": Der Entrypoint braucht kurz root-Rechte, um das
# gemountete Datenverzeichnis zu übereignen, und wechselt dann selbst auf
# den Benutzer node. Der Serverprozess läuft also unprivilegiert.
EXPOSE 2555

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2555/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.js"]
