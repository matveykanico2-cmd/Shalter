// Старый сервер (server/) — CommonJS, подключается через require. Каталог server/
// лежит в корне репозитория: apps/api/src/legacy и apps/api/dist/legacy на одной глубине.
import { createRequire } from "node:module";
import path from "node:path";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);
const LEGACY_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "..", "server");

export interface LegacyApp {
  app: RequestHandler;
  useBuilt: boolean;
}

export const loadLegacyApp = (): LegacyApp => require(path.join(LEGACY_DIR, "app.js"));

// Общая обработка запроса до маршрутов (server/front.js): заголовки, сжатие, cookie,
// JSON-тело, лимиты. Express 4-приложение, как и старое.
export const loadLegacyFront = (): RequestHandler & { handle: LegacyHandle } => require(path.join(LEGACY_DIR, "front.js")).front;
type LegacyHandle = (req: IncomingMessage, res: ServerResponse, done: (err?: unknown) => void) => void;

export const startLegacyRuntime = (server: Server, listen: (port: number | string) => unknown): Promise<unknown> =>
  require(path.join(LEGACY_DIR, "runtime.js")).startRuntime(server, listen);

// Подключение к SQLite, которое открывает server/db.js (он же создаёт и обновляет
// схему). Drizzle работает поверх него: общие транзакции и одна очередь записи со старым кодом.
export const legacyConnection = (): BetterSqlite3.Database => require(path.join(LEGACY_DIR, "db.js"));

// Модули старого сервера, которыми пользуется Nest, пока их часть не перенесена.
// Каждый — один и тот же экземпляр, что у server/: общие события и состояние.
const legacyModule = <T>(name: string): T => require(path.join(LEGACY_DIR, name));

/** Отзыв доступа (сеанс, пароль, бан): открытые сокеты пользователя закрываются (server/ws.js). */
export const emitAccessRevoked = (userId: string): void =>
  legacyModule<{ emitAccessRevoked: (userId: string) => void }>("lib/sessionEvents.js").emitAccessRevoked(userId);

/** Replacer для всех JSON-ответов (server/lib/publicJson.js). */
export const publicJsonReplacer = legacyModule<{ publicJsonReplacer: (key: string, value: unknown) => unknown }>(
  "lib/publicJson.js"
).publicJsonReplacer;

/** Подписчиков канала в ответе видят только его админы (server/lib/chatForViewer.js). */
export const shapeBodyForViewer = legacyModule<{ shapeBodyForViewer: (body: unknown, uid: string | undefined) => unknown }>(
  "lib/chatForViewer.js"
).shapeBodyForViewer;
