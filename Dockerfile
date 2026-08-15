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
# This stage's only job is `npm run build` (scripts/build.js), which just
# bundles public/ with esbuild — it never touches better-sqlite3, express, or
# any other "dependencies" package, and its output (public/dist) is the only
# thing copied out of this stage below. A plain `npm ci` still installs and
# runs lifecycle scripts for *everything* in package.json regardless, which
# on this project means node-gyp compiling better-sqlite3 from source (dead
# weight — stage 2 recompiles its own copy from scratch against musl anyway,
# see its comment below) *and* Electron's postinstall downloading and
# unzipping its multi-hundred-MB runtime binary (electron/electron-builder
# are devDependencies too, for the desktop-shell packaging flow, unrelated to
# this build). That combination — a large g++ compile plus a large postinstall
# download/extract, on top of npm's own memory use — is almost certainly what
# was actually driving the container over its memory limit, not merely how
# many jobs ran in parallel.
#
# --ignore-scripts skips every package's lifecycle scripts (so neither of
# those happens), then esbuild's own install.js is run by hand afterwards —
# it just copies the right platform binary out of the @esbuild/* optional
# dependency npm already resolved, a fast, cheap step compared to what it
# replaces. No python3/make/g++ needed in this stage at all any more, since
# nothing here compiles anything from source.
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund --maxsockets 3 \
  && node node_modules/esbuild/install.js
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
# Deliberately placed here, before the heavy npm ci below, rather than after
# it (where it's only actually needed) — BuildKit runs independent stages'
# steps concurrently by default, and both stages run their own heavy npm ci
# (stage 1's install, this stage's better-sqlite3 compile). Two of those at
# once can outrun the build host's memory even though either alone fits;
# a COPY --from=build this early makes this stage's remaining steps
# (including the npm ci right below) wait on stage 1 finishing first, so
# only one heavy install runs at a time.
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
# This is the one native compile the app actually needs at runtime (better-
# sqlite3, against musl) — unlike the build stage above, it can't just be
# skipped. It's also the likelier of the two npm-ci steps to OOM: g++
# compiling SQLite's amalgamated source (a single very large .c file bundled
# inside better-sqlite3) is a genuinely memory-hungry compile, independent of
# how many jobs run in parallel. -Os trades a little runtime performance for
# a meaningfully smaller peak compiler memory footprint than the default -O2;
# npm_config_jobs=1 has less to do here (there's only the one native package)
# but costs nothing to keep for consistency with the build stage.
ENV CFLAGS="-Os"
ENV CXXFLAGS="-Os"
ENV npm_config_jobs=1
# node-gyp needs Node's own header tarball to compile a native addon against
# — on musl (this Alpine image) it defaults to fetching that from
# unofficial-builds.nodejs.org instead of the regular dist site, and that
# host isn't always reachable from a build sandbox's network policy (seen as
# an ETIMEDOUT here). Pointing --dist-url at the official, virtually-always-
# reachable nodejs.org/dist sidesteps that; the extra fetch-retries/timeout
# just add resilience against an ordinary transient blip on top of that.
ENV npm_config_disturl=https://nodejs.org/dist
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_maxtimeout=30000
RUN npm ci --omit=dev --no-audit --no-fund --maxsockets 3 && apk del .build-deps
# /app/data isn't in the repo or the build stage — it's a runtime mount point
# (see DEPLOY.md: mount a persistent volume here for data/app.db). Just make
# sure the directory exists so better-sqlite3 has somewhere to create the
# DB file if no volume is mounted.
RUN mkdir -p ./data

# config.env — настройки развёртывания, которые едут вместе с репозиторием
# (SMTP для писем восстановления). Копируется отдельно и в самом конце: выше
# лежат npm ci и нативная сборка better-sqlite3, и попади этот файл туда, любая
# правка настройки заново запускала бы весь этот компиляционный слой.
#
# Звёздочка не для красоты: COPY с шаблоном, который ничего не нашёл, ломает
# сборку, а package.json рядом есть всегда — так строка переживает и отсутствие
# config.env. Секреты в образ при этом не попадают: .dockerignore исключает
# .env*, который читается позже и перекрывает этот файл.
COPY package.json config.env* ./

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
# Файлы настроек читаются только этими флагами, и передать их через NODE_OPTIONS
# нельзя — node такое в нём запрещает ("--env-file-if-exists= is not allowed in
# NODE_OPTIONS"). Поэтому они здесь, в CMD. Без них процесс поднимался с пустой
# конфигурацией: SMTP считался ненастроенным, письма восстановления не уходили,
# а админка честно показывала «SMTP не задан» — при том что config.env лежал
# в репозитории.
#
# Порядок тот же, что и в npm start: config.env из репозитория, затем .env
# (в образ не попадает, но может быть примонтирован), затем настоящие
# переменные окружения — каждый следующий перекрывает предыдущий.
CMD ["node", "--env-file-if-exists=config.env", "--env-file-if-exists=.env", "server/index.js"]


