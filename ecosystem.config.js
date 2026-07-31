// PM2 process config sized for a small 2-core/2GB box. Deliberately a single
// instance, not cluster mode: call state, WebSocket connections, and the
// data-layer read cache (server/data/store.js) all live in one process's
// memory — a second worker wouldn't share any of that and would silently
// diverge (stale presence, missed signaling, a second copy of the JSON cache).
// If you outgrow one process, that's a sign to move the data layer to a real
// database with pub/sub, not to add `instances: 2` here.
module.exports = {
  apps: [
    {
      name: "shalter",
      script: "server/index.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=768",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Restart if the process grows past this — a safety net against a
      // slow leak, not something that should trigger in normal operation.
      max_memory_restart: "900M",
      // Back off between crash-restarts instead of hot-looping if something
      // is fatally broken (e.g. data/ missing) — protects the 2 cores from a
      // restart storm eating both of them.
      exp_backoff_restart_delay: 200,
      max_restarts: 10,
      min_uptime: "15s",
      watch: false,
      out_file: "logs/out.log",
      error_file: "logs/error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
