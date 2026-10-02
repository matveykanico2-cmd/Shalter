module.exports = {
  apps: [
    {
      name: "shalter",
      script: "server/index.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "--env-file-if-exists=config.env --env-file-if-exists=.env --max-old-space-size=768",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "900M",
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
