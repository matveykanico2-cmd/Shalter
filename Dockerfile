# Multi-stage build.
#
# Stage 1 builds the client bundle with esbuild (a devDependency). esbuild
# ships prebuilt native binaries linked against glibc — Alpine's musl libc
# doesn't run them without extra compat packages, so the build stage uses a
# Debian-slim base specifically to sidestep that. This stage's output is
# thrown away except for server/, public/ (now containing public/dist), and
# data/ — none of that carries the Debian toolchain into the final image.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 is what actually ships: small Alpine base, production dependencies
# only (express/ws/cookie-parser/compression/express-static-gzip — all pure
# JS, no native/musl concerns), plus the already-built output from stage 1.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data

# Respect $PORT if the platform injects one (Dokploy/most PaaS do); server/index.js
# already reads process.env.PORT and falls back to 3000 — this just documents it.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ >/dev/null || exit 1

# --max-old-space-size=768 matches DEPLOY.md's sizing for a small (2GB-class)
# host; raise it only alongside more RAM, not instead of it.
CMD ["node", "--max-old-space-size=768", "server/index.js"]
