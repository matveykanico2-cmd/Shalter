// Запуск: node src/main.ts (Node 22.18+ сам снимает типы). Настройки — README.md.
import fs from "node:fs";

import { configFromEnv } from "./config.ts";
import { createProxyServer } from "./proxy.ts";

const config = configFromEnv();
const certFile = process.env.TLS_CERT_FILE;
const keyFile = process.env.TLS_KEY_FILE;
if (!!certFile !== !!keyFile) throw new Error("TLS_CERT_FILE и TLS_KEY_FILE задаются вместе");
const tls = certFile && keyFile ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) } : undefined;

const port = Number(process.env.PORT) || (tls ? 443 : 8080);
const host = process.env.HOST || "0.0.0.0";
const server = createProxyServer(config, tls);

server.listen(port, host, () => {
  const scheme = tls ? "https" : "http";
  const base = config.publicUrl?.origin ?? `${scheme}://<адрес сервера>${port === (tls ? 443 : 80) ? "" : `:${port}`}`;
  console.log(`[shalter-proxy] ${scheme}://${host}:${port} → ${config.upstream.origin}`);
  console.log(`[shalter-proxy] ссылка для друзей: ${base}/${config.secret ? `?proxy=${config.secret}` : ""}`);
});

const stop = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
