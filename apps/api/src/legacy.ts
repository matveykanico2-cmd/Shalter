// Старый сервер (server/) — CommonJS, подключается через require. Каталог server/
// лежит в корне репозитория: apps/api/src и apps/api/dist на одной глубине.
import { createRequire } from "node:module";
import path from "node:path";
import type { Server } from "node:http";
import type { RequestHandler } from "express";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);
const LEGACY_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "server");

export interface LegacyApp {
  app: RequestHandler;
  useBuilt: boolean;
}

export const loadLegacyApp = (): LegacyApp => require(path.join(LEGACY_DIR, "app.js"));

export const startLegacyRuntime = (server: Server, listen: (port: number | string) => unknown): Promise<unknown> =>
  require(path.join(LEGACY_DIR, "runtime.js")).startRuntime(server, listen);

// Подключение к SQLite, которое открывает server/db.js (он же создаёт и обновляет
// схему). Drizzle работает поверх него: общие транзакции и одна очередь записи со старым кодом.
export const legacyConnection = (): BetterSqlite3.Database => require(path.join(LEGACY_DIR, "db.js"));
