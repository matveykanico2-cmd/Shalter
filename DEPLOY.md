# Deploying on a small box (2 cores, 2GB RAM, 30GB swap)

This app is a single Express process backed by flat JSON files — it was never
designed to scale horizontally, which actually matches a small box well: the
goal here is keeping that one process lean, not spreading it across cores.

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
npm install --omit=dev   # skip nodemon in production
npm install -g pm2       # process supervisor — restarts on crash, log capture
pm2 start ecosystem.config.js
pm2 save                 # persist across reboots
pm2 startup              # prints the systemd command to enable that
```

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

## What was changed for this box specifically

- `server/data/store.js`: in-memory read cache, so polling (chat list,
  messages, typing) doesn't re-read-and-JSON.parse the whole file on every
  request — the biggest recurring CPU/IO cost as message history grows.
- `server/index.js`: gzip (`compression` middleware) and a 1-hour static-asset
  cache header, both reducing repeat network/IO work.
- `package.json`: `--max-old-space-size=768` on the `start` script.
- `ecosystem.config.js`, `deploy/nginx.conf.example`: this document's
  recommendations, as actual config rather than just prose.
