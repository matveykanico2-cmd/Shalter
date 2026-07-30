# Deploying on a small box (2 cores, 2GB RAM, 30GB swap)

This app is a single Express process backed by flat JSON files — it was never
designed to scale horizontally, which actually matches a small box well: the
goal here is keeping that one process lean, not spreading it across cores.

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
`3000` (or whatever `$PORT` Dokploy injects — `server/index.js` already reads
`process.env.PORT`).

Three things that matter and are easy to miss:

1. **Mount a persistent volume at `/app/data`.** This app's entire database
   is flat JSON files in that directory. Without a volume, `/app/data` is
   just part of the container's writable layer — the moment Dokploy rebuilds
   or recreates the container (any redeploy), it resets to the seed data
   baked into the image and **every user, chat, and message is gone.** In
   Dokploy's UI this is a "Volume" / "Mount" entry: host path (or a
   Dokploy-managed volume) → container path `/app/data`.
2. **Exactly one replica.** Same reason as the bare-VPS path (see "The one
   hard rule" below): the read cache and write lock in
   `server/data/store.js` are per-process. Two containers both mounting the
   same volume would race on it exactly like the bug that in-process
   locking was built to fix. Don't set a replica count above 1 and don't
   enable any autoscaling for this service.
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
# 1. Node.js 20+ (engines requires >=20.9.0)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Get the code onto the server (git clone, scp, rsync — whatever you use)
git clone <your-repo-url> /opt/messenger
cd /opt/messenger

# 3. Install, build, then drop devDependencies (esbuild/nodemon aren't needed at runtime)
npm install
npm run build
npm prune --omit=dev

# 4. Process supervisor
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # <-- prints ONE MORE command starting with "sudo env PATH=..." — run that too,
              #     it's what makes PM2 survive a reboot; pm2 save alone does not.

# 5. nginx + a real TLS certificate (REQUIRED — see "Why HTTPS isn't optional" below)
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/messenger
sudo sed -i 's/your-domain.example/YOUR-ACTUAL-DOMAIN/' /etc/nginx/sites-available/messenger
sudo ln -s /etc/nginx/sites-available/messenger /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR-ACTUAL-DOMAIN   # obtains + wires in the cert, sets up auto-renewal

# 6. Firewall — only 80/443 need to be public; Node's port 3000 stays localhost-only
#    (nginx proxies to it — see deploy/nginx.conf.example's `upstream` block)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

At this point: `https://YOUR-ACTUAL-DOMAIN` should load the app. Do the OS
tuning below (swappiness, log rotation) once, then treat "code changed" as
`git pull && npm install && npm run build && pm2 restart messenger`.

### Why HTTPS isn't optional here

Browsers refuse camera/microphone access (`getUserMedia`) on any origin that
isn't HTTPS or `localhost` — that's a browser security rule, not something
this app can work around. Skip step 5 and the app will otherwise run fine,
but calls, voice messages, and video-notes will all silently fail to record
or connect the moment a real visitor (not you on localhost) opens it.

## The one hard rule: run exactly one instance

The data layer (`server/data/store.js`) now keeps an in-memory read cache and
serializes writes with an in-process lock, on the assumption that **this
process is the only writer**. A second Node instance (another `pm2 start`, a
second `node server/index.js`, a cluster/fork mode with >1 worker) would keep
its own separate cache and lock, invisible to the first — two processes can
then race on the same files exactly like the bug this was built to fix. Don't
run this app clustered; if load ever outgrows one process, that's a sign to
move the data layer to a real database, not to add workers here.

## Running it

```bash
npm install               # full install — esbuild (build step) is a devDependency
npm run build              # bundles+minifies+precompresses public/ into public/dist/
npm prune --omit=dev       # esbuild's job is done; drop it (and nodemon) before running
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

`ecosystem.config.js` is already sized for this box:
- `instances: 1`, `exec_mode: "fork"` — see above.
- `--max-old-space-size=768` — caps the V8 heap at 768MB, leaving ~1.25GB for
  nginx, the OS, and swap headroom, out of 2GB total. Raise this only if you
  also add RAM — a higher cap just delays an OOM kill under real memory
  pressure, it doesn't create memory.
- `max_memory_restart: "900M"` — a safety net restart if something leaks;
  should never trigger in normal operation.

## nginx in front

Use `deploy/nginx.conf.example` (copy, fill in your domain + cert paths).
It terminates TLS and serves static files, which costs far less memory per
connection than Node doing the same — worth it specifically because RAM is
the scarce resource here, not request volume. It also gzips responses; if you
enable nginx's gzip, set `DISABLE_APP_GZIP=1` in the Node process's
environment (in `ecosystem.config.js`'s `env` block) so responses aren't
compressed twice for no benefit.

The `/ws` location block matters — without it, WebSocket upgrade requests
(call signaling, presence) get proxied as plain HTTP and silently fail to
upgrade, and the app falls back to slower HTTP polling for everything.

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

`data/messages.json` holds every message inline, including voice notes,
video-notes, and images as base64 — there's no object storage in this app by
design (see README.md). On a small disk this is the thing most likely to
become a real problem over time. Keep an eye on `du -sh data/` periodically;
if it's growing fast, that's a signal to prune old attachments or add real
object storage before the disk (or the in-memory cache's RAM footprint) becomes
the bottleneck.

## The production build (`npm run build`)

`scripts/build.js` (esbuild) bundles every `public/js/**` module into one
minified `public/dist/app.js`, minifies the CSS, and — the part that actually
saves CPU at runtime, not just bytes — precompresses each output to `.gz` and
`.br` at build time. `server/index.js` then serves those precomputed files
directly (`express-static-gzip`) instead of running gzip on every single
request the way the `compression` middleware does for dynamic API responses.
Measured output for this app:

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
- `server/index.js`: serves the precompressed build via `express-static-gzip`
  when `NODE_ENV=production` and a build is present (falls back to raw files
  otherwise); `compression` middleware now only runs against dynamic API
  responses, not `/dist/*`, so static assets never cost CPU to compress at
  request time.
- `server/data/store.js`: in-memory read cache, so polling (chat list,
  messages, typing) doesn't re-read-and-JSON.parse the whole file on every
  request — the biggest recurring CPU/IO cost as message history grows.
- `package.json`: `--max-old-space-size=768` on the `start` script.
- `ecosystem.config.js`, `deploy/nginx.conf.example`: this document's
  recommendations, as actual config rather than just prose.
