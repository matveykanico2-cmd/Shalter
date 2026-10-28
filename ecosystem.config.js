module.exports = {
  apps: [
    {
      name: "shalter",
      // Бэкенд на NestJS (сборка: npm run build:api).
      script: "apps/api/dist/main.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "--env-file-if-exists=config.env --env-file-if-exists=.env --max-old-space-size=768",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Сжимает nginx (deploy/nginx.conf.example) — Node не тратит на это процессор.
        // Без nginx перед приложением уберите эту строку.
        DISABLE_APP_GZIP: "1",
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
