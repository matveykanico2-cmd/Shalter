import { monitorEventLoopDelay } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

// Сколько сервер думал над запросом к API: заголовок Server-Timing (виден во вкладке Network
// браузера) и строка в логе, если дольше SLOW_REQUEST_MS (по умолчанию 500 мс). В логе —
// шаблон маршрута (/api/chats/:id/messages), без id, токенов и query.
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 500;

const elapsedMs = (started: bigint) => Number(process.hrtime.bigint() - started) / 1e6;

export function requestTiming() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    const started = process.hrtime.bigint();
    const writeHead = res.writeHead;
    res.writeHead = function (this: Response, ...args: Parameters<Response["writeHead"]>) {
      if (!this.headersSent) this.setHeader("Server-Timing", `app;dur=${elapsedMs(started).toFixed(1)}`);
      return writeHead.apply(this, args);
    } as Response["writeHead"];
    res.on("finish", () => {
      const ms = elapsedMs(started);
      if (ms < SLOW_REQUEST_MS) return;
      const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : "(без маршрута Nest)";
      console.warn(`slow request: ${req.method} ${route} ${res.statusCode} ${Math.round(ms)}ms`);
    });
    next();
  };
}

// Запросы к SQLite синхронные: долгий запрос держит весь процесс. Раз в минуту — задержка
// цикла событий, если её p99 выше EVENT_LOOP_WARN_MS (по умолчанию 100 мс).
const EVENT_LOOP_WARN_MS = Number(process.env.EVENT_LOOP_WARN_MS) || 100;

export function watchEventLoop() {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    const p99 = delay.percentile(99) / 1e6;
    const max = delay.max / 1e6;
    if (p99 >= EVENT_LOOP_WARN_MS) console.warn(`event loop delay: p99 ${Math.round(p99)}ms, max ${Math.round(max)}ms за минуту`);
    delay.reset();
  }, 60_000);
  timer.unref();
}
