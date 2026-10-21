# Deploying on a small box (2 cores, 2GB RAM, 30GB swap)

This app is a single Express process backed by a SQLite database file
(`data/app.db`) — it was never designed to scale horizontally, which actually
matches a small box well: the goal here is keeping that one process lean, not
spreading it across cores.

Nothing below runs itself — this is a manual, one-time setup, not a push-button
deploy. None of it is hard, but skipping a step (especially TLS — see below)
leaves the app half-working. Two paths, depending on how you're hosting:

- **Docker / Dokploy (or any Docker-based PaaS)** — use the `Dockerfile` at
  the repo root. Skip straight to "Deploying via Docker / Dokploy" below;
  the nginx/certbot/PM2 sections after it are for the *other* path and don't
  apply once Dokploy/Traefik is doing that job.
- **A bare VPS with nothing on it yet** — follow "From a blank server to
  running" below (Node + PM2 + nginx + certbot by hand).

## Deploying via Docker / Dokploy

Use the `Dockerfile` at the repo root (multi-stage: builds the client bundle
in a Debian-slim stage, ships from a small Alpine stage — see the file's
comments for why two stages). In Dokploy: set **Build Type → Dockerfile**
instead of Nixpacks, point it at this repo, and set the exposed port to
`3000` (or whatever `$PORT` Dokploy injects — the server already reads
`process.env.PORT`).

Three things that matter and are easy to miss:

1. **Mount a persistent volume at `/app/data`.** Everything that must survive
   a redeploy lives in that one directory:
   - `data/app.db` — the entire database, a single SQLite file, plus its
     `-wal`/`-shm` sidecar files (WAL mode, see `server/db.js`).
   - `data/uploads/` — every uploaded attachment, as a real file on disk (see
     `server/routes/uploads.js`). Photos, videos and documents are *not* in
     the database; the database only stores the `/uploads/<id>` URL pointing
     here. A volume that covers `app.db` but not this directory leaves every
     message pointing at a file that 404s.

   (The Web Push keypair is *not* a separate file — it lives in the `vapid_keys`
   table inside `app.db`, so it's covered by the same volume. Losing it would
   silently invalidate every existing push subscription.)

   The path comes from `process.cwd()` (`server/db.js`, `routes/uploads.js`)
   and the image's WORKDIR is `/app`, hence `/app/data`.

   Without a volume, `/app/data` is just part of the container's writable
   layer — the moment Dokploy rebuilds or recreates the container (any
   redeploy), it resets to empty and **every user, chat, and message is
   gone.** In Dokploy's UI this is a "Volume" / "Mount" entry: host path (or
   a Dokploy-managed volume) → container path `/app/data`.

   **Size it for media, not for the database.** The SQLite file stays small
   (text and metadata); the uploads directory is what grows, and the per-file
   ceilings are deliberately generous — 2 GB for a video, 1 GB for a photo,
   500 MB for a document (`server/lib/uploadLimits.js`). A handful of users
   sending video fills tens of gigabytes quickly, and there is no automatic
   pruning or total-storage cap. Lower those limits if the volume is small.
   Deleting a message "for everyone" does delete its files.

   **Backing it up:** don't `cp data/app.db` on a running container. In WAL
   mode the newest committed data can still be in the `-wal` file, so a plain
   copy of just the `.db` can be a torn, older snapshot. Use SQLite's own
   consistent-snapshot mechanism, which is safe while the app is running:

   ```bash
   sqlite3 /app/data/app.db ".backup '/backup/app.db'"   # or: "VACUUM INTO '/backup/app.db'"
   ```

   Back up `data/uploads/` separately with any ordinary file copy (`rsync`
   etc.) — those files are written once and never modified, so there's no
   consistency concern.

   **Ключи шифрования.** Текст сообщений в базе (`server/lib/textCrypto.js`)
   и файлы в `data/uploads/` (`server/lib/fileCrypto.js`) хранятся
   зашифрованными — как облачные чаты Telegram. Ключи берутся из
   `MESSAGES_KEY` и `UPLOADS_KEY` (по 64 hex-символа, `openssl rand -hex 32`),
   а если их нет — создаются при первом запуске в `data/messages.key` и
   `data/uploads.key`. Потеря ключа = потеря всей переписки/файлов без
   возможности восстановления, поэтому храните ключи в резервной копии — но
   **отдельно** от `app.db`: копия базы вместе с ключом ничем не защищена.
   В git ключам не место (`/data/*.key` в `.gitignore`).

   Эти два ключа — мастер-ключи: сами данные шифруются ключами, которые
   меняются каждые 2 минуты (`server/lib/keyring.js`, срок задаёт
   `KEY_ROTATION_SECONDS`, по умолчанию 120). Ротируемые ключи лежат в таблице
   `crypto_keys` той же базы, завёрнутыми мастер-ключом, так что в резервную
   копию `app.db` они попадают сами. Без мастер-ключа они бесполезны.

   Первый запуск после обновления сам зашифрует уже лежащую переписку, удалит
   старый поисковый указатель по открытому тексту и сделает `VACUUM`, чтобы
   открытый текст не остался в свободных страницах файла. На большой базе это
   займёт время и потребует свободного места размером с саму базу.
2. **Exactly one replica.** SQLite's own locking (WAL mode, see
   `server/db.js`) makes concurrent access from multiple processes *safe* —
   it won't corrupt the database the way the old flat-JSON-file store's
   custom in-process lock could if run twice. But typing presence and
   WebSocket connections are still in-memory and per-process, so two
   containers would each have an incomplete, inconsistent view of who's
   online/typing. Don't set a replica count above 1 and don't enable any
   autoscaling for this service.
3. **Check `/ws` actually upgrades after the first deploy.** Dokploy's
   Traefik proxy generally handles WebSocket upgrades transparently, but
   it's worth confirming: place a call or watch for the "typing…" indicator
   between two logged-in sessions. If neither ever appears, the app has
   silently fallen back to slower HTTP polling for everything — that's the
   symptom of `/ws` not reaching the container.

HTTPS: if Dokploy has a domain attached to this service, it almost certainly
already provisions Let's Encrypt via Traefik automatically — you don't need
the certbot steps further down. HTTPS itself is still non-negotiable, though
(see "Why HTTPS isn't optional" below): without it, camera/mic access is
blocked by the browser and calls/voice-messages/video-notes won't work.

I wrote this Dockerfile carefully for this specific app (right Node version,
the actual entry point and port, the esbuild/Alpine issue above) but couldn't
build-test it myself — Docker isn't available in the environment I worked in.
Treat the first deploy as the real test; if `npm run build` or `npm ci`
fail inside the build stage, the error in Dokploy's build log will point at
which of those two steps to look at.

## From a blank server to running (assumes Ubuntu/Debian, a domain already pointed at the server's IP)

```bash
# 1. Node.js 22+ (better-sqlite3 requires it; engines field enforces >=22)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Get the code onto the server (git clone, scp, rsync — whatever you use)
git clone <your-repo-url> /opt/shalter
cd /opt/shalter

# 3. Install, build the client and the NestJS backend, then drop devDependencies
#    (esbuild/TypeScript/nodemon aren't needed at runtime)
npm install
npm run build
npm run build:api
npm prune --omit=dev

# 4. Process supervisor
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # <-- prints ONE MORE command starting with "sudo env PATH=..." — run that too,
              #     it's what makes PM2 survive a reboot; pm2 save alone does not.

# 5. nginx + a real TLS certificate (REQUIRED — see "Why HTTPS isn't optional" below)
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/shalter
sudo sed -i 's/your-domain.example/YOUR-ACTUAL-DOMAIN/' /etc/nginx/sites-available/shalter
sudo ln -s /etc/nginx/sites-available/shalter /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR-ACTUAL-DOMAIN   # obtains + wires in the cert, sets up auto-renewal

# 6. Firewall — only 80/443 need to be public; Node's port 3000 stays localhost-only
#    (nginx proxies to it — see deploy/nginx.conf.example's `upstream` block)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 1935/tcp only if you want streaming from OBS Studio (see "Эфиры из OBS" below).
# Skip it and everything else still works — streams from the browser don't use it.
sudo ufw allow 1935/tcp
sudo ufw enable
```

## Эфиры из OBS (RTMP)

Кроме эфира из браузера, ведущий может вещать из OBS Studio и любой другой
программы с «Custom RTMP». Приём работает в том же процессе Node
(`server/rtmp.js`), отдельной службы ставить не нужно, ffmpeg не нужен —
картинка не перекодируется.

Что для этого нужно на сервере:

- **Открыть порт 1935/tcp наружу** — в него OBS и вещает. Через nginx он не
  идёт: RTMP это не HTTP. Если порт закрыт, приложение работает полностью, кроме
  этой одной возможности; в интерфейсе ведущий увидит поля для OBS, а картинка
  не появится.
- **Порт 8010 наружу открывать не надо.** По нему сервер сам у себя забирает
  картинку, чтобы отдать её зрителю через `/api/live/:id/feed.flv` — там же
  проверяется, что зритель состоит в чате. Смотреть по 8010 с других машин
  запрещено в самом медиасервере (`prePlay` в `server/rtmp.js`), но лишний
  открытый порт всё равно ни к чему.
- Оба порта меняются переменными `RTMP_PORT` и `RTMP_HTTP_PORT`, если 1935 уже
  занят чем-то другим.

Как этим пользуются: в чате канала или группы — «Начать эфир» → «Через OBS
Studio или другую программу». Приложение покажет «Сервер» и «Ключ потока» — их
вставляют в OBS в «Настройки → Вещание», выбрав сервис «Настраиваемый…». Ключ
видит только ведущий; зрителям он не отдаётся, и подсматривать картинку по нему
напрямую нельзя.

Задержка — около одной-двух секунд. Оговорка: такой эфир не проигрывается в
Safari на iPhone (там в обычной вкладке нет Media Source Extensions) — зритель
на iPhone увидит об этом надпись, а не чёрный экран. Эфиры из браузера на iPhone
работают как работали.

## TURN-сервер для звонков

Звонки и эфиры из браузера — это WebRTC, а для него публичного STUN
(`stun.l.google.com`, зашит в код и работает без настройки) достаточно не
всегда. За симметричным NAT — обычная ситуация у мобильных операторов и части
домашних роутеров — прямое соединение между двумя браузерами через один STUN
не проходит вообще, и звонок просто не соединяется: экран «Вызов…» висит,
пока не сработает таймаут. Тут нужен TURN — сервер-ретранслятор, через
который идёт медиа, если напрямую пробиться не удалось.

Своих кредов в код не зашито (раньше здесь был общий бесплатный демо-релей
Open Relay Project — он нестабилен и не предназначен для реальной нагрузки).
Сервер отдаёт клиенту TURN-креды через `GET /api/calls/ice-servers`
(`server/lib/turnCredentials.js`) — два варианта, на выбор через `.env`.

### Вариант Б (быстро) — готовый хостинг TURN

Если поднимать coturn пока не хочется, а звонки нужно починить сейчас: у
Metered.ca есть бесплатный тариф с настоящими (не демо-shared) TURN-кредами.

1. Зарегистрироваться на metered.ca, в дашборде создать TURN-приложение —
   там будет готовый список серверов и пара логин/пароль.
2. Прописать в `.env` (или в Environment сервиса, если деплой через Dokploy —
   см. «Deploying via Docker / Dokploy» выше):
   ```
   TURN_URLS=turn:a.relay.metered.ca:80,turn:a.relay.metered.ca:443,turns:a.relay.metered.ca:443
   TURN_USERNAME=выданный-логин
   TURN_CREDENTIAL=выданный-пароль
   ```
   (адреса серверов и креды — те, что покажет их дашборд, не обязательно
   `a.relay.metered.ca` — подставьте свои).
3. Redeploy. Никакого coturn ставить не нужно — сервер просто передаёт эти
   креды клиенту как есть.

Минус: креды статичные и живут, пока не смените их в `.env` вручную — в
отличие от варианта А ниже их нельзя точечно отозвать. Для проверки, что
звонки вообще заработали, и для небольшой нагрузки — достаточно.

### Вариант А (правильно) — свой coturn

Сервер сам выдаёт клиенту одноразовые TURN-креды на час, подписанные общим
секретом — тем же механизмом, что у `turn-rest-api` в coturn. Значит нужен
свой coturn и общий секрет, известный ему и приложению.

**1. Поставить coturn** (на том же сервере, что и приложение, или на
отдельном — главное, чтобы порты были открыты наружу):

```bash
sudo apt install coturn
```

**2. Сгенерировать секрет** и прописать его в `/etc/turnserver.conf`:

```bash
openssl rand -hex 32
```

```
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=ВСТАВИТЬ_СГЕНЕРИРОВАННЫЙ_СЕКРЕТ
realm=ваш-домен.example
# Сертификат — тот же, что у nginx (Let's Encrypt), если нужен turns:// (TLS):
cert=/etc/letsencrypt/live/ваш-домен.example/fullchain.pem
pkey=/etc/letsencrypt/live/ваш-домен.example/privkey.pem
# Диапазон портов для самих медиа-релеев:
min-port=49152
max-port=65535
no-cli
```

Включить и перезапустить:

```bash
sudo systemctl enable --now coturn
sudo systemctl restart coturn
```

**3. Открыть порты наружу** (в фаерволе/у хостера): 3478/udp+tcp,
5349/udp+tcp (если используете `turns:`), и весь диапазон `min-port`–`max-port`
(UDP) — по нему идёт само медиа, сузить его нельзя без ограничения числа
одновременных звонков.

**4. Указать тот же секрет приложению** — в `.env` (см. `.env.example`):

```
TURN_URLS=turn:ваш-домен.example:3478,turns:ваш-домен.example:5349
TURN_SECRET=ТОТ_ЖЕ_СЕКРЕТ_ЧТО_В_static-auth-secret
```

`pm2 restart shalter`, и следующий звонок уже получит свежие TURN-креды от
`/api/calls/ice-servers`. Без этих двух переменных приложение работает как
раньше — только на STUN, то есть звонки между сетями без симметричного NAT
всё ещё соединяются, а с ним — нет.

Проверить, что TURN действительно используется: в Chrome на
`chrome://webrtc-internals` во время звонка ищите кандидатов с
`relay` вместо `srflx`/`host`.

At this point: `https://YOUR-ACTUAL-DOMAIN` should load the app. Do the OS
tuning below (swappiness, log rotation) once, then treat "code changed" as
`git pull && npm install && npm run build && npm run build:api && npm prune --omit=dev && pm2 restart shalter`.

### Why HTTPS isn't optional here

Browsers refuse camera/microphone access (`getUserMedia`) on any origin that
isn't HTTPS or `localhost` — that's a browser security rule, not something
this app can work around. Skip step 5 and the app will otherwise run fine,
but calls, voice messages, and video-notes will all silently fail to record
or connect the moment a real visitor (not you on localhost) opens it.

## Обновление работающего сервера (сцены подарков, nginx, S3)

Этот раздел для того, кто выкладывает новую версию на **уже работающий**
сервер (PM2 + nginx, путь `/opt/shalter`; другой путь — подставьте свой везде
ниже). Новый сервер с нуля ставится по разделу выше, сюда заглядывать не нужно.
Docker/Dokploy — пункт в конце раздела.

Что поменялось для выкладки:
- конфиг nginx `deploy/nginx.conf.example` написан заново — **старый нужно
  заменить**: он был целым `nginx.conf` и в `sites-enabled` не проходил
  `nginx -t`, а статику не раздавал вовсе;
- статику (сборка, сцены подарков, эмодзи и картинки подарков) теперь отдаёт
  nginx с диска, а не Node; сжатие ответов тоже делает nginx;
- сцены подарков — 25 тысяч JSON-файлов в `public/gift-scenes` (~120 МБ на
  диске) вместо одного модуля на 60 МБ;
- в базе появляется таблица `upload_deletions` — сервер создаёт её сам при
  старте, руками ничего делать не нужно;
- в `ps`/`htop` у приложения теперь два процесса Node: основной запускает
  фоновый для обходов по таймеру и обработки вложений (раздел «Фоновый процесс»
  ниже). Делать ничего не нужно; памяти нужно примерно на 120 МБ больше. В базе
  появляется таблица `background_jobs` — тоже сама;
- каталог встроенных подарков и подсказки к дням рождения — теперь данные
  (`server/data/catalog/*.json`), а не код. Делать ничего не нужно;
- при первом запуске сервер один раз обрезает старые поздравления с днём
  рождения: в каждом лежало ~640 КБ подсказок подарков, остаётся 8. Отметка об
  этом — в новой таблице `data_migrations`, повторно перенос не идёт. На большой
  базе первый старт может занять на несколько секунд дольше — это он;
- хранение вложений в S3 с шифрованием на стороне хранилища — **по желанию**,
  включается отдельно (шаг 7).

### Шаги

1. **Резервная копия** каталога `data/` целиком (база, `*.key`, `uploads/`)
   и текущего конфига nginx:
   ```bash
   cd /opt/shalter
   tar czf ~/shalter-data-$(date +%F).tgz data
   sudo cp /etc/nginx/sites-available/shalter ~/nginx-shalter-$(date +%F).bak
   ```
2. **Код и зависимости, сборка:**
   ```bash
   git pull
   npm install
   npm run build          # в конце строка «Картинки из архивов: … файлов в dist/packs»
   npm run build:api      # бэкенд на NestJS, см. «Переключение на apps/api»
   npm prune --omit=dev
   ```
   Без строки про `dist/packs` nginx не найдёт картинки и отдаст их через Node —
   работать будет, но медленнее; повторите `npm run build`.
3. **Права на чтение для nginx.** nginx (пользователь `www-data`) читает файлы
   прямо из `/opt/shalter/public`. Проверка — обе команды должны напечатать `ok`:
   ```bash
   sudo -u www-data test -r /opt/shalter/public/dist/index.html && echo ok
   sudo -u www-data test -r /opt/shalter/public/gift-scenes/index.json && echo ok
   ```
   Если нет — дайте право на чтение и проход по каталогам:
   `sudo chmod o+rx /opt /opt/shalter /opt/shalter/public` и
   `sudo chmod -R o+rX /opt/shalter/public`.
4. **Новый конфиг nginx.** Если сертификат ставил certbot, он дописал в старый
   файл блоки `listen 443 ssl` и `ssl_certificate` — новый файл их не содержит,
   поэтому после замены certbot запускается ещё раз:
   ```bash
   sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/shalter
   sudo sed -i 's/your-domain.example/ВАШ-ДОМЕН/' /etc/nginx/sites-available/shalter
   sudo nginx -t
   sudo certbot --nginx -d ВАШ-ДОМЕН   # «reinstall» существующего сертификата, новый не выпускается
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Если `nginx -t` ругается на `limit_req_zone … already defined` или
   `upstream … duplicate` — эти строки уже есть в другом файле
   (`/etc/nginx/nginx.conf` или ещё один сайт): уберите старые, оставьте новые.
5. **Перезапуск Node** — чтобы он подхватил `DISABLE_APP_GZIP=1` из
   `ecosystem.config.js`:
   ```bash
   pm2 restart ecosystem.config.js --update-env
   pm2 logs shalter --lines 30   # «shalter server listening …» и «[worker] фоновый процесс запущен (pid …)», без ошибок
   ```
6. **Проверка снаружи** (с любой машины):
   ```bash
   D=https://ВАШ-ДОМЕН
   curl -sI $D/dist/app.js | grep -iE 'cache-control|x-powered-by'
   curl -sI $D/gift-scenes/index.json | grep -iE 'cache-control|x-powered-by'
   curl -sI $D/img/emoji/0023-20e3.png | grep -iE 'cache-control|x-powered-by'
   curl -s -o /dev/null -w '%{http_code}\n' $D/gift-scenes/nope.json
   curl -s -o /dev/null -w '%{http_code}\n' $D/api/version
   ```
   Ожидается: у трёх файлов есть `Cache-Control` (`immutable` у `/dist/`,
   `max-age=3600` у сцен, `max-age=604800` у эмодзи) и **нет**
   `X-Powered-By: Express` — значит, их отдал nginx, а не Node. Несуществующая
   сцена — `404`, `/api/version` — `200`. Затем в браузере: открыть приложение,
   чат с эмодзи, магазин подарков (картинки и анимации подарков на месте),
   позвонить — WebSocket идёт через тот же nginx. Отправить фото и видео:
   через несколько секунд у них должно появиться превью (его делает фоновый
   процесс) — если превью не появляется, смотрите `pm2 logs shalter` на строки
   `[worker]` и `[jobs]`.
7. **S3 (по желанию, отдельным шагом).** Если вложения переезжают в S3 —
   раздел «Переезд вложений в S3…» ниже. Важно: открытые файлы в бакет пишутся,
   только когда задан `S3_SSE`; без него всё работает как раньше.

**Откат:** вернуть старый конфиг nginx из резервной копии
(`sudo cp ~/nginx-shalter-*.bak /etc/nginx/sites-available/shalter && sudo systemctl reload nginx`),
`git checkout` предыдущей версии, `npm install && npm run build`,
`pm2 restart ecosystem.config.js --update-env`. Таблицы `upload_deletions` и
`background_jobs` старой версии не мешают. Если проблема только с фоновым
процессом — откатывать код не нужно: `BACKGROUND_WORKER=0` в `.env` и
`pm2 restart shalter --update-env` возвращают всё в один процесс. Если откат только nginx, без кода, — уберите
`DISABLE_APP_GZIP` из `ecosystem.config.js`, иначе ответы Node останутся без сжатия.

**Docker / Dokploy.** Там статику по-прежнему отдаёт Node (nginx-конфиг не
нужен), сжатие остаётся в Node. Достаточно пересобрать образ и перезапустить
контейнер; S3 — по разделу ниже, переменные задаются в настройках Dokploy.

## Переключение на apps/api (бэкенд на NestJS)

С этой версии приложение запускается из `apps/api/dist/main.js` (NestJS)
вместо `server/index.js`. Это тот же сервер для клиентов: тот же порт, те же
`data/`, `.env`, `config.env` и конфиг nginx. Вход, чаты, сообщения, файлы,
WebSocket и звонки обслуживает новый код, всё остальное Nest по-прежнему
передаёт старому `server/`. Фоновый процесс и RTMP запускаются так же.
Таблиц и форматов данных переключение не меняет, поэтому откат в обе стороны
безопасен и данные не теряются.

Что поменялось для выкладки:
- после `npm run build` нужен ещё `npm run build:api` — он собирает
  `apps/api/dist`. Без него PM2 не найдёт `apps/api/dist/main.js` и процесс
  не поднимется;
- `ecosystem.config.js` запускает `apps/api/dist/main.js`. `pm2 restart` новый
  путь не подхватывает, поэтому процесс один раз пересоздаётся (шаг 3);
- в логе при старте `shalter server (nest) listening on …` вместо
  `shalter server listening on …`.

### Шаги (PM2)

1. **Резервная копия** `data/`:
   ```bash
   cd /opt/shalter
   tar czf ~/shalter-data-$(date +%F).tgz data
   ```
2. **Код, зависимости, обе сборки:**
   ```bash
   git pull
   npm install
   npm run build
   npm run build:api
   test -f apps/api/dist/main.js && echo ok   # должно напечатать ok
   npm prune --omit=dev
   ```
3. **Пересоздать процесс** с новым путём запуска:
   ```bash
   pm2 delete shalter
   pm2 start ecosystem.config.js
   pm2 save
   pm2 logs shalter --lines 30
   ```
   В логе: `[worker] фоновый процесс запущен (pid …)`,
   `shalter server (nest) listening on …` и
   `[static] отдаём собранную версию из public/dist …`, без ошибок.
4. **Проверка снаружи** (с любой машины):
   ```bash
   D=https://ВАШ-ДОМЕН
   curl -s -o /dev/null -w '%{http_code}\n' $D/api/version
   curl -s -o /dev/null -w '%{http_code}\n' $D/api/chats
   curl -s -o /dev/null -w '%{http_code}\n' --http1.1 \
     -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' $D/ws
   ```
   Ожидается `200`, `401`, `401`: `/api/chats` и `/ws` без входа отвечают
   «не авторизован». Затем в браузере: войти, открыть чат, отправить сообщение
   и фото (через несколько секунд появляется превью), позвонить — у второго
   участника звонок должен прийти сразу, без задержки. `pm2 logs shalter` на
   эти действия ошибок не пишет.
5. **Память.** Основному процессу Nest нужно примерно на 40 МБ больше, чем
   старому серверу (на чистой базе 156 МБ против 115 МБ), фоновому — столько
   же, сколько раньше. Через несколько минут работы посмотрите `pm2 ls`. Лимит
   `max_memory_restart: 900M` прежний.

**Откат** на старый сервер, без отката кода:
```bash
cd /opt/shalter
pm2 delete shalter
SHALTER_BACKEND=legacy pm2 start ecosystem.config.js
pm2 save
pm2 logs shalter --lines 30   # «shalter server listening …» без «(nest)»
```
Обратно на Nest — шаг 3 (без `SHALTER_BACKEND`).

### Docker / Dokploy

Достаточно пересобрать образ и перезапустить контейнер: `Dockerfile` сам
собирает `apps/api` и запускает `apps/api/dist/main.js`. В логе контейнера —
`shalter server (nest) listening …`. Проверка — шаг 4 выше.

**Откат:** в настройках приложения в Dokploy задать свою команду запуска
контейнера (переопределение `CMD`):
```
node --env-file-if-exists=config.env --env-file-if-exists=.env server/index.js
```
и перезапустить контейнер — старый сервер лежит в том же образе. Чтобы
вернуться на Nest, очистить поле.

## Переезд вложений в S3 с шифрованием на стороне хранилища

Вложения можно держать в S3-совместимом хранилище (Яндекс Object Storage,
Cloudflare R2, AWS S3, MinIO) — переменные `S3_*` в `.env.example`,
реализация в `server/lib/storage.js`.

**Как это работает.** В бакете файлы лежат открытыми байтами, а шифрует их само
хранилище (SSE). Запрос `/uploads/<id>` по-прежнему приходит в Node: он проверяет
сессию и доступ к файлу (участник чата, загрузивший, покупатель платного поста) и
отвечает **302 на подписанную ссылку** в бакет. Байты файла, Range для видео и
кэширование отдаёт бакет — Node их не расшифровывает и не пропускает через себя.
Подпись берётся на начало часа и действует два часа: в течение часа ссылка на файл
одна и та же, и браузер берёт файл из своего кэша. Ссылку, выданную участнику,
можно переслать — она действует до двух часов, после этого нужен новый запрос через
Node с проверкой доступа.

Ключ `UPLOADS_KEY` (или `data/uploads.key`) нужен, пока в хранилище остаются
старые файлы, зашифрованные приложением: их расшифровывает перенос. После
переезда новые файлы им не шифруются, но **ключ не удаляйте** — он остаётся в
резервных копиях и может понадобиться при откате.

### Порядок переезда

1. **Резервная копия** `data/` целиком (база, `*.key`, `uploads/`).
2. **Бакет с шифрованием.** Создайте бакет (приватный, без публичного доступа) и
   включите в нём шифрование по умолчанию. В Яндексе: KMS → создать
   симметричный ключ → в настройках бакета «Шифрование» выбрать его; сервисному
   аккаунту бакета нужна роль `kms.keys.encrypterDecrypter` на этот ключ.
   Режим включается **только явно** переменной `S3_SSE`:
   - `S3_SSE=bucket` — шифрование бакета по умолчанию. Сервер при старте (и раз в
     10 минут, пока не получится) спрашивает его у бакета (`GetBucketEncryption`;
     ключу доступа нужно это право). Пока бакет не подтвердил шифрование, новые
     файлы шифрует приложение, а перешифровка старых не запускается —
     в логе `[s3] … нет шифрования по умолчанию`.
   - `S3_SSE=aws:kms` + `S3_SSE_KMS_KEY_ID` или `S3_SSE=AES256` (AWS) — сервер
     передаёт заголовок шифрования с каждым файлом, проверка не нужна.

   Без `S3_SSE` всё остаётся как раньше: файлы шифрует приложение и отдаёт Node,
   открытыми байтами в бакет ничего не пишется.
3. **Ключ доступа** с правами на чтение и запись в бакет. Пропишите `S3_BUCKET`,
   `S3_ACCESS_KEY`, `S3_SECRET_KEY` (и `S3_ENDPOINT`/`S3_REGION`, если не Яндекс)
   в окружении сервера — в `.env` на сервере или в настройках Dokploy,
   **не в `config.env` в git**.
4. **CORS бакета.** Часть файлов клиент читает через `fetch` (осциллограмма
   голосовых, просмотр текстовых файлов, скачивание в приложении, QR-карточка с
   аватаром), а после редиректа это запрос к домену бакета:
   `npm run s3:cors -- --origin=https://ВАШ-ДОМЕН`. Без CORS картинки, видео и
   аудио всё равно показываются; пока CORS не настроен, можно задать
   `S3_DIRECT_DOWNLOAD=0` — тогда открытые файлы отдаёт Node, как раньше.
   Из бакета отдаются только картинки, видео и аудио: бакет не умеет ставить
   `X-Content-Type-Options: nosniff` и `Content-Security-Policy: sandbox`, поэтому
   текст, PDF, svg и файлы неизвестных типов по-прежнему отдаёт Node с ними.
5. **Перезапустите сервер.** Новые файлы сразу идут в бакет открытыми. Старые
   сервер переносит сам, в фоне (`server/lib/uploadsMigration.js`), проход раз в
   10 минут, ход виден в логах (`[s3] …`):
   - файлы с диска (`data/uploads`) расшифровываются, распаковываются и
     заливаются в бакет; с диска файл удаляется, только когда объект в бакете
     совпал с ним по размеру;
   - объекты, которые уже лежат в бакете зашифрованными приложением (их залили
     до перехода), переписываются открытыми на том же ключе.

   Адреса файлов в базе не меняются. Пока файл не перенесён, его отдаёт Node, как
   раньше — 404 не будет. Когда в бакете не останется старых объектов, сервер
   пишет `data/s3-plain.done` и больше бакет не перебирает.
   `S3_AUTO_MIGRATE=0` выключает автоперенос, `S3_MIGRATE_KEEP_LOCAL=1` —
   копирует, но диск не чистит.
6. Проверьте в приложении старые фото, видео, голосовые, файлы.

Перенос можно провести и вручную, скриптом, при работающем сервере:
`npm run uploads:to-s3 -- --dry-run` покажет, сколько предстоит;
`npm run uploads:to-s3 -- --concurrency=8` переносит и перешифровывает;
`--delete-local` чистит диск. Прерывать и запускать снова можно — обработанное
пропускается. Файлы моложе минуты скрипт не трогает: они могли ещё записываться. Скрипт
и сервер видят одну базу: файл, удалённый сервером, пока скрипт его переписывал,
скрипт обратно в бакет не вернёт (`upload_deletions`). Если зашифрованный объект
перешифровали, пока сервер его отдавал, сервер замечает это по ETag и отвечает
новой версией.

**Откат на шифрование приложением:** `S3_APP_ENCRYPTION=1`. Новые файлы снова
шифрует приложение и отдаёт Node; уже открытые объекты Node тоже отдаёт сам.
Отметка `data/s3-plain.done` при этом стирается, и при возврате бакет будет
перепроверен.

Что меняется в режиме S3: суточная уборка файлов (`server/lib/orphanSweep.js`)
работает только по локальному диску и в S3 отключена — неиспользуемые объекты
в бакете сами не удаляются. Статистика сервера показывает, что хранилище в S3,
но не его размер — его смотрите в консоли облака.

## The one hard rule: run exactly one instance

The data layer (`server/db.js`, SQLite via `better-sqlite3`) safely handles
concurrent access across processes on its own — that part of the old
"never run two instances" rule is gone. What isn't: typing presence
(`server/data/typing.js`) and WebSocket connections (`server/ws.js`, call
signaling + online/offline presence) are in-memory, per-process state with no
cross-process sync. A second Node instance (another `pm2 start`, a second
`node server/index.js`, a cluster/fork mode with >1 worker) would have its own
disconnected view of who's online and typing, and roughly half of any two
users' WS traffic would land on the "wrong" process and never reach the other
side. Don't run this app clustered; if load ever outgrows one process, that
state needs to move to something shared (e.g. Redis pub/sub) before adding
workers, not just point them at the same database.

### Фоновый процесс (он не «второй экземпляр»)

`node server/index.js` сам запускает дочерний процесс `server/worker.js` — в
`ps`/`htop` их два, в PM2 приложение одно. Запускать его отдельно не нужно и
нельзя: он работает только как дочерний. В нём идёт то, что не должно тормозить
ответы на запросы:
- обходы по таймеру: автоудаление сообщений, приём донатов, дни рождения и
  праздники, напоминания, удаление аккаунтов по сроку, уборка файлов, перенос
  вложений в S3;
- очередь обработки вложений: превью фото и видео, длительность голосовых,
  перекодирование видео в историях. Задачи лежат в таблице `background_jobs`, так
  что перезапуск их не теряет — доделаются после него.

Сокетов в фоновом процессе нет: события для клиентов он передаёт основному.
Упал — основной поднимает его снова через секунду (в логе
`[worker] фоновый процесс завершился …` и `… запущен (pid …)`); основной при
этом продолжает отвечать. Остановка основного (`pm2 stop/restart`) гасит и его.

Отложенные сообщения и приём эфиров из OBS остаются в основном процессе.

Память: фоновый процесс — около 120 МБ при старте, его куча ограничена 256 МБ
(`WORKER_MAX_OLD_SPACE_MB`); sharp и ffmpeg во время обработки берут сверху.
`max_memory_restart` в PM2 смотрит только на основной процесс.
`BACKGROUND_WORKER=0` — всё в одном процессе, как раньше (если с фоновым что-то не
так; очередь тогда разбирает основной).

## Running it

```bash
npm install               # full install — esbuild (build step) is a devDependency
npm run build              # bundles+minifies+precompresses public/ into public/dist/
npm run build:api          # compiles the NestJS backend into apps/api/dist/ (what PM2 starts)
npm prune --omit=dev       # esbuild/TypeScript are done; drop them (and nodemon) before running
npm install -g pm2         # process supervisor — restarts on crash, log capture
pm2 start ecosystem.config.js
pm2 save                   # persist across reboots
pm2 startup                # prints the systemd command to enable that
```

Re-run `npm run build` after every deploy (any change under `public/js/` or
`public/styles/`) — `NODE_ENV=production` only serves `public/dist/` when it
actually exists, otherwise it quietly falls back to the raw unbundled files,
so a stale or missing build doesn't break anything, it just gives up the
size/CPU win below until you rebuild.

Built-in gift scenes are not part of the bundle: they live as one small JSON file
per gift in `public/gift-scenes/<id>.json` plus a list in
`public/gift-scenes/index.json`, and the client fetches only the scenes of the
gifts on screen. They are plain static files — nginx serves `/gift-scenes/`
straight from disk (see "nginx in front"). To regenerate them, use the
`scripts/generate-scenes*.js` generators; `node scripts/gift-scenes.js` rebuilds
the index after manual edits.

`ecosystem.config.js` is already sized for this box:
- `instances: 1`, `exec_mode: "fork"` — see above.
- `--max-old-space-size=768` — caps the V8 heap at 768MB, leaving ~1.25GB for
  nginx, the OS, and swap headroom, out of 2GB total. Raise this only if you
  also add RAM — a higher cap just delays an OOM kill under real memory
  pressure, it doesn't create memory.
- `max_memory_restart: "900M"` — a safety net restart if something leaks;
  should never trigger in normal operation.

## nginx in front

Use `deploy/nginx.conf.example` (step 5 above copies it; fill in your domain).
It is a site file — it goes into `sites-available`, inside the stock
`nginx.conf`'s `http {}` block. It terminates TLS and serves every static file
from disk, so Node only answers the API, `/ws`, `/uploads/…` access checks and
the app's pages. That costs far less memory per connection than Node doing the
same — worth it specifically because RAM is the scarce resource here.

What nginx serves itself (paths assume the app lives in `/opt/shalter`):

| Path | From disk | Cache |
| --- | --- | --- |
| `/dist/…` | `public/dist` — the bundle, with the `.gz` built next to each file | 1 year, immutable |
| `/gift-scenes/…` | `public/gift-scenes` | 1 hour |
| `/img/emoji/…`, `/gift-symbols/…`, `/gift-emoji/…`, `/tgs/…` | `public/dist/packs` — unpacked by `npm run build` from `server/assets/packs` | 7 days |
| any other file in `public/` | `public/` | 1 hour; `/sw.js` — always re-checked |

A file that isn't on disk falls through to Node, so a skipped build costs
speed, not correctness. Re-run `npm run build` after every `git pull`: it also
refreshes `public/dist/packs` when the archives change. Brotli: the build writes
`.br` files too; install `libnginx-mod-http-brotli-static` and uncomment
`brotli_static` to serve them.

nginx also gzips what Node answers, so `ecosystem.config.js` sets
`DISABLE_APP_GZIP=1` and Node doesn't compress anything. Without nginx in front
(PM2 alone), remove that line.

The request-rate limit (`limit_req`) only covers what reaches Node: one chat
screen can pull dozens of emoji images at once, and nginx serves those for free.

Если старый конфиг nginx уже развёрнут — замените его по разделу
«Обновление работающего сервера» выше.

A CDN in front of the whole domain (it must pass WebSockets through) needs no
extra rules: it caches by the `Cache-Control` above, and Node marks the API
`no-cache` and attachments `private`.

The `/ws` location block matters — without it, WebSocket upgrade requests
(call signaling, presence) get proxied as plain HTTP and silently fail to
upgrade, and the app falls back to slower HTTP polling for everything.

The `/api/uploads` location block matters for the same reason: the global
`client_max_body_size 25m` is sized for JSON message bodies, and a real file
upload (a raw body, see `server/routes/uploads.js`) would be rejected with a
413 by nginx long before Node's own per-kind limit applied. That block raises
it to 5100m — just above the 5GB ceiling in `server/lib/uploadLimits.js` — and
turns request buffering off so a multi-gigabyte upload isn't spooled to this
box's disk in full before Node sees it. **Если конфиг nginx уже развёрнут,
эту правку нужно перенести на сервер руками** — иначе большие файлы будут
падать с 413 на прокси.

Превью тяжёлых вложений (240p-копия видео, уменьшенная картинка) делает сам
сервер через `ffmpeg-static` — отдельной установки ffmpeg в систему не нужно,
бинарник приезжает с пакетом. Важно: `npm ci` на сервере должен выполнять
install-скрипты пакета (именно они скачивают бинарник), иначе превью для видео
тихо не будут получаться. Одновременно идёт не больше одного перекодирования
(`server/lib/mediaPreview.js`) — на двух ядрах это защищает отзывчивость
звонков.

## Sending e-mail

Two things send mail: confirming a new address (Settings → Конфиденциальность →
Почта, where the code goes to the address being claimed) and the notice that a
password was reset. Recovery itself no longer needs a delivered letter — it asks
for the address and the phone number on the account, both of which the owner
already knows.

Mail therefore only needs to work for *changing* an address. Configuration goes
in `config.env` (committed, arrives with a `git pull`) or `.env` (gitignored,
overrides it), and real environment variables override both — see
`server/lib/loadConfig.js`, which the app reads itself rather than relying on
launch flags:

```
SMTP_URL=smtps://no-reply%40shalter.ru:APP_PASSWORD@smtp.yandex.ru:465
MAIL_FROM=Shalter <no-reply@shalter.ru>
```

`SMTP_URL` is a normal connection URL — note that the `@` inside the username
has to be percent-encoded as `%40`. If quoting that is awkward, use the four
separate variables instead: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

Use an **app password**, never the mailbox's own password: it is stored in
plain text in the process environment, and an app password can be revoked on
its own.

### Through an ordinary mailbox, with no DNS records at all

This is the way out when the domain's DNS panel isn't reachable. Sending
through a mailbox at Yandex/Mail.ru/Gmail means *their* domain signs the
letter, so `shalter.ru` needs no SPF, DKIM or PTR of its own and Gmail accepts
the result. Using Yandex as the example:

1. Яндекс ID → Безопасность → **Пароли приложений** → «Почта» — this is not the
   mailbox password, and it is the only thing SMTP will accept.
2. Яндекс Почта → Настройки → **Почтовые программы** → allow access via
   IMAP/SMTP.
3. Two variables, and the address in both must be the **same** mailbox — a
   provider signs only its own, and refuses a `From:` it did not authenticate.
   Match the host to the mailbox's domain: `smtp.yandex.ru` for `@yandex.ru`,
   `smtp.yandex.com` for `@yandex.com` (both answer, but the account lives on
   one of them):

```
SMTP_URL=smtps://shalter.mail%40yandex.ru:APP_PASSWORD@smtp.yandex.ru:465
MAIL_FROM=Shalter <shalter.mail@yandex.ru>
```

4. `node scripts/mail-test.js you@gmail.com` — it logs in before sending, so a
   wrong password, a blocked port and a rejected letter are three different
   messages rather than one silent failure.

The trade-off is the visible sender (`@yandex.ru` rather than `@shalter.ru`)
and the provider's daily limit — a few hundred letters, far above what
recovery codes need.

**Deliverability is DNS, not code.** Without these three records on the sending
domain, correctly sent mail still lands in spam:

- `SPF` — a TXT record naming the servers allowed to send as your domain;
- `DKIM` — the signing key your mail provider gives you;
- `DMARC` — a TXT record at `_dmarc.` saying what to do with mail failing the
  first two.

Any provider works — the domain's own mailbox (Yandex 360, Mail.ru for
Business, Beget) is the least setup; a transactional service (Unisender Go,
SendPulse) gives delivery statistics and higher limits.

**With nothing configured**, the server tries to deliver the letter itself
(`server/lib/mailer.js` → `server/lib/directMail.js`): it looks up the
recipient domain's MX record and speaks SMTP to it directly on port 25, with no
account anywhere. This is how mail worked before relays, and it still works —
but only where the receiving side is willing to take mail from an unvouched-for
sender. Measured from a machine with no reverse DNS on its address:

| Recipient | Result |
| --- | --- |
| `@mail.ru` | accepted (`250 Go ahead`) |
| `@yandex.ru` | accepted (rejected only for a non-existent test mailbox) |
| `@gmail.com` | **refused** — `550 5.7.26 ... #authentication` |

Google refuses unauthenticated mail outright: it wants proof that the domain's
owner authorized this server, and only the domain's DNS can carry that proof.
Every letter is already DKIM-signed (`server/lib/dkim.js` generates the keypair
on first use and keeps it in the database), so the remaining half is publishing
the matching records:

```
npm run mail-dns
```

That prints the three TXT records — SPF, DKIM, DMARC — with the real public key
and the server's own IP already filled in, ready to paste into the DNS panel at
the registrar. Also worth asking the hosting provider for a `PTR` (reverse DNS)
record on the server's address; some receivers check it before anything else.

Do not regenerate the DKIM key once its record is published — the private half
lives in `data/app.db`'s `dkim_keys` table, and a new keypair invalidates every
signature until DNS catches up. Copy the database, don't recreate it.

Direct sending can be turned off with `MAIL_DIRECT=0` — worth doing once real
SMTP is configured, since a failed direct attempt costs several seconds of
waiting on remote servers.

**If that fails too**, letters are written to `data/outbox/*.eml` so the flow
can be walked on a development machine. That is refused when
`NODE_ENV=production` — those files contain one-time codes in plain text, and a
production box that cannot send mail should say so rather than quietly spool
secrets to disk. Recovery then reports the receiving server's own refusal, so
the reason a code never arrived is visible in the logs.

## Почему приложение может грузиться медленно

Три причины, все замеренные, а не предполагаемые.

**1. Сборка не выполнена.** Без `npm run build` браузер тянет 96 отдельных
модулей вместо одного файла — 100 запросов и ~1 МБ против 5 запросов и 92 КБ.
На быстром канале разница незаметна, на мобильном интернете это секунды.
Собранная версия теперь используется, **как только она есть на диске**: проверки
`NODE_ENV` больше нет, потому что не всякая платформа её выставляет, а без неё
приложение отдавало исходники при готовой сборке рядом. В логах при старте
видно, что именно раздаётся:

```
[static] отдаём собранную версию из public/dist (один файл, сжатый заранее)
[static] отдаём исходники из public/ — для боевого сервера выполните npm run build
```

**2. Редактор кода ботов с чужого CDN.** Он подтягивался при первом же открытии
приложения: 45 запросов и 564 КБ на esm.sh — на экране входа, у каждого
посетителя. Теперь грузится в момент открытия редактора
(`public/js/lib/codeEditor.js`), и на старте внешних запросов нет вовсе.

**3. Сжатие.** Сборка кладёт рядом `.br` и `.gz`, сервер отдаёт готовое без
затрат процессора. Если перед приложением стоит nginx или Traefik, который сам
жмёт ответы, поставьте `DISABLE_APP_GZIP=1`, чтобы не сжимать дважды (под PM2
это уже сделано в `ecosystem.config.js`).

Проверить, что всё на месте, можно снаружи одной командой:

```bash
curl -sI -H "Accept-Encoding: br" https://ваш-домен/dist/app.js | grep -i "content-encoding\|content-length"
```

Ожидаемое: `content-encoding: br` и порядка 90 КБ. Если вместо этого приходит
404 — сборка не выполнена, и страница грузит исходники.

## OS-level tuning

**Swap.** 30GB swap against 2GB RAM is a large safety margin, which is good
for surviving a spike without an OOM kill — but swapping is slow, so you want
the kernel reaching for it only as a last resort, not eagerly:

```bash
# Lower swappiness so RAM is preferred; swap is the safety net, not the
# default. Persists across reboots via sysctl.conf.
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**File descriptor limit.** Each open WebSocket connection (calls, presence)
and each HTTP keep-alive connection holds a file descriptor. The default
limit (1024 on many distros) is usually fine at this app's expected scale,
but if you see `EMFILE` errors in the logs, raise it:

```bash
# /etc/security/limits.conf
shalter soft nofile 4096
shalter hard nofile 4096
```

**Log rotation.** PM2 logs (and the app's own console output) grow unbounded
otherwise — on a small disk that matters. Install the rotation module once:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
```

## Watch the data directory's size

`data/app.db`'s `messages` table holds every message inline, including voice
notes, video-notes, and images as base64 in the `attachments` column — there's
no object storage in this app by design (see README.md). On a small disk this
is the thing most likely to become a real problem over time. Keep an eye on
`du -sh data/` periodically; if it's growing fast, that's a signal to prune
old attachments or add real object storage before the disk becomes the
bottleneck. (`VACUUM`ing the database after a bulk prune reclaims the freed
space — SQLite doesn't shrink the file automatically on delete.)

## The production build (`npm run build`)

`scripts/build.js` (esbuild) bundles every `public/js/**` module into one
minified `public/dist/app.js`, minifies the CSS, and — the part that actually
saves CPU at runtime, not just bytes — precompresses each output to `.gz` and
`.br` at build time. `server/app.js` then serves those precomputed files
directly (`express-static-gzip`) instead of running gzip on every single
request the way the `compression` middleware does for dynamic API responses.
Behind nginx the same files go out via `gzip_static`, and Node never sees
those requests (see "nginx in front"). The build also unpacks the image
archives into `public/dist/packs` for nginx (`UNPACK_ASSETS=0` skips that, as
the Dockerfile does). Measured output for this app:

| file | raw | gzip | brotli |
|---|---|---|---|
| app.js (all client JS bundled) | 96KB | 26KB | 22KB |
| components.css | 33KB | 5.4KB | 4.8KB |
| base.css | 2.3KB | 0.8KB | 0.6KB |

Concretely, on a 2-core box this means: one HTTP request instead of ~25
(every view/component/lib module was a separate file before bundling), ~75%
fewer bytes over the wire, and the compression CPU cost paid once at build
time instead of on every page load for every visitor.

## What was changed for this box specifically

- `scripts/build.js`, `npm run build`: bundle+minify+precompress the client
  (see table above) — the single biggest lever available since this app has
  no other CPU-heavy work (it's a thin JSON API + static files).
- `server/app.js`: serves the precompressed build via `express-static-gzip`
  when `NODE_ENV=production` and a build is present (falls back to raw files
  otherwise); `compression` middleware now only runs against dynamic API
  responses, not `/dist/*`, so static assets never cost CPU to compress at
  request time.
- `server/db.js`: real SQLite (`better-sqlite3`, synchronous, in-process —
  no separate DB server to run) instead of the old flat-JSON-file store, so
  polling (chat list, messages, typing) and every query hits an indexed
  table instead of re-reading and re-scanning a whole JSON file on every
  request — the biggest recurring CPU/IO cost as message history grows.
- `package.json`: `--max-old-space-size=768` on the `start` script.
- `ecosystem.config.js`, `deploy/nginx.conf.example`: this document's
  recommendations, as actual config rather than just prose.
