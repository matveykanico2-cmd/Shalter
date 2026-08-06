# Multi-stage build.
#
# Stage 1 builds the client bundle with esbuild (a devDependency). esbuild
# ships prebuilt native binaries linked against glibc — Alpine's musl libc
# doesn't run them without extra compat packages, so the build stage uses a
# Debian-slim base specifically to sidestep that. This stage's output is
# thrown away except for server/, public/ (now containing public/dist), and
# data/ — none of that carries the Debian toolchain into the final image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 is a native module (node-gyp) and requires Node >=22 — no
# prebuilt binary matches otherwise, forcing a source compile, which needs
# these build tools present.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# npm_config_jobs=1 stops node-gyp from compiling native modules (better-
# sqlite3) in parallel — concurrent compile jobs are what spike memory during
# npm ci, not the install itself. --max-old-space-size=1024 here bounds npm's
# own process during that install/build stage; it's separate from the
# runtime stage's 384MB cap below, which is what actually ships.
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV npm_config_jobs=1
RUN npm ci --no-audit --no-fund --maxsockets 3
COPY . .
RUN npm run build

# Stage 2 is what actually ships: small Alpine base, production dependencies
# only, plus the already-built output from stage 1. better-sqlite3's native
# binary is glibc-linked when compiled in the (Debian-based) build stage, so
# it can't just be copied into this musl-based image — it's recompiled here
# against musl instead, then the build toolchain is removed to keep the
# image small.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && apk del .build-deps
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
# /app/data isn't in the repo or the build stage — it's a runtime mount point
# (see DEPLOY.md: mount a persistent volume here for data/app.db). Just make
# sure the directory exists so better-sqlite3 has somewhere to create the
# DB file if no volume is mounted.
RUN mkdir -p ./data

# Respect $PORT if the platform injects one (Dokploy/most PaaS do); server/index.js
# already reads process.env.PORT and falls back to 3000 — this just documents it.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ >/dev/null || exit 1

# --max-old-space-size=384 targets a 512MB container: the V8 heap cap only
# covers the old-space object heap, not the whole process — Node's own
# baseline (new-space/code-space, native modules like better-sqlite3, socket
# buffers, OS overhead) typically adds another 100-150MB of RSS on top, so
# capping the heap at ~75% of the 512MB ceiling (rather than at 512 itself)
# leaves that headroom instead of guaranteeing an OOM kill under load. This
# only bounds the V8 heap, though — it does NOT make Docker enforce 512MB;
# pair it with an actual container memory limit (`docker run -m 512m`,
# compose's `mem_limit: 512m`, or Dokploy's resource-limit field) or nothing
# stops the process from being killed by the *host's* OOM killer instead once
# it exceeds whatever the host actually has free. Set via NODE_OPTIONS (not a
# CMD flag) so the limit still applies even if the hosting platform overrides
# CMD with its own start command.
ENV NODE_OPTIONS="--max-old-space-size=384"
CMD ["node", "server/index.js"]


