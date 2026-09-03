# Multi-stage build.
#
# Первый этап собирает клиент через esbuild (он в devDependencies). Основа —
# Debian: esbuild привозит готовые двоичные файлы под glibc, и на Alpine они
# без пакетов совместимости не запускаются. От этого этапа дальше едут только
# server/ и public/ (уже с public/dist) — инструментарий сборки в итоговый
# образ не попадает.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# This stage's only job is `npm run build` (scripts/build.js), which just
# bundles public/ with esbuild — it never touches better-sqlite3, express, or
# any other "dependencies" package, and its output (public/dist) is the only
# thing copied out of this stage below. A plain `npm ci` still installs and
# runs lifecycle scripts for *everything* in package.json regardless, which
# on this project means node-gyp compiling better-sqlite3 from source (dead
# weight — собирать его не нужно нигде: в пакете лежат готовые двоичные файлы,
# см. комментарий ко второму этапу) *and* Electron's postinstall downloading and
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

# Второй этап — то, что уезжает на сервер: только рабочие зависимости плюс
# уже собранный клиент из первого этапа. Основа снова Alpine, она вдвое легче
# Debian.
#
# Здесь же исправление, из-за которого сборка падала.
#
# Раньше в этом этапе стояло `npm ci --omit=dev` без --ignore-scripts. У
# better-sqlite3 есть binding.gyp, и npm в таком случае сам запускает
# `node-gyp rebuild` — то есть собирает пакет из исходников, хотя собирать
# нечего: в самом пакете лежат готовые двоичные файлы под все нужные системы,
# включая musl (prebuilds/linuxmusl-x64.node), и загрузчик берёт их оттуда.
#
# Стоило это дорого. Ради компиляции ставились python3, make и g++ — только
# эта установка занимала тринадцать минут. Сама сборка упиралась в память на
# амальгамации SQLite. А node-gyp вдобавок лез в сеть за заголовками Node — и
# ровно там всё и развалилось: соединение оборвалось посреди распаковки
# архива (ECONNRESET).
#
# --ignore-scripts убирает всю эту ветку целиком. Из рабочих зависимостей
# ничего другого в install-скриптах не нуждается: нативный пакет здесь один.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Копирование из первого этапа стоит до установки намеренно: BuildKit
# выполняет независимые этапы параллельно, и два тяжёлых npm ci разом
# способны выесть память сборочной машины, хотя каждый по отдельности
# помещается. Эта строка заставляет дождаться окончания первого этапа.
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
# Повторные попытки — на случай обычного сетевого сбоя при скачивании пакетов.
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_maxtimeout=30000
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --maxsockets 3
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


