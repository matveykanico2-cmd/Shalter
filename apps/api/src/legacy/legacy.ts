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

// --- То, что вход берёт у ещё не перенесённых модулей (чаты, сообщения, почта, пуш) ---
// Подключаются при первом вызове: эти модули при загрузке открывают базу, а unit-тесты
// apps/api импортируют код без неё.

export interface LegacyChat {
  id: string;
  memberIds: string[];
}

interface SystemChat {
  findOrCreateDm: (userIdA: string, userIdB: string) => Promise<LegacyChat>;
  sendMessageAndBroadcast: (chat: LegacyChat, senderId: string, text: string) => Promise<unknown>;
}

/** Личный чат двоих, созданный при необходимости (server/lib/systemChat.js). */
export const findOrCreateDm = (userIdA: string, userIdB: string): Promise<LegacyChat> =>
  legacyModule<SystemChat>("lib/systemChat.js").findOrCreateDm(userIdA, userIdB);

/** Сообщение в чат с рассылкой участникам по WS (server/lib/systemChat.js). */
export const sendMessageAndBroadcast = (chat: LegacyChat, senderId: string, text: string): Promise<unknown> =>
  legacyModule<SystemChat>("lib/systemChat.js").sendMessageAndBroadcast(chat, senderId, text);

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Письмо через SMTP или в data/outbox (server/lib/mailer.js). */
export const sendMail = (mail: Mail): Promise<{ delivered: boolean; reason?: string }> =>
  legacyModule<{ sendMail: (mail: Mail) => Promise<{ delivered: boolean; reason?: string }> }>("lib/mailer.js").sendMail(mail);

interface Push {
  sendPushToUser: (userId: string, payload: PushPayload, options?: object) => Promise<unknown>;
  MESSAGE_PUSH: object;
}
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Пуш на устройства пользователя с настройками обычного сообщения (server/push.js MESSAGE_PUSH) поверх extra. */
export const sendMessagePush = (userId: string, payload: PushPayload, extra: object = {}): Promise<unknown> => {
  const push = legacyModule<Push>("push.js");
  return push.sendPushToUser(userId, payload, { ...push.MESSAGE_PUSH, ...extra });
};

/** Удаление аккаунта со всеми чатами, ботами, сеансами и контактами (server/lib/deleteAccount.js). */
export const deleteAccount = (userId: string): Promise<void> =>
  legacyModule<{ deleteAccount: (userId: string) => Promise<void> }>("lib/deleteAccount.js").deleteAccount(userId);

/** Проверка юзернейма: формат, резерв, занятость пользователем, каналом или аукционом (server/lib/username.js). null — свободен. */
export const checkUsername = (raw: string): Promise<{ status: number; error: string } | null> =>
  legacyModule<{ checkUsername: (raw: string) => Promise<{ status: number; error: string } | null> }>("lib/username.js").checkUsername(raw);

export interface PasskeyPublicKey {
  alg: number;
  jwk: object;
}

interface WebAuthn {
  b64url: (buf: Buffer) => string;
  newChallenge: (kind: "register" | "login", userId?: string) => string;
  verifyRegistration: (
    body: Record<string, unknown>,
    opts: { origin: string; rpId: string; userId: string }
  ) => { credentialId: string; publicKey: PasskeyPublicKey; signCount: number };
  verifyAssertion: (
    body: Record<string, unknown>,
    opts: { origin: string; rpId: string; passkey: { publicKey: PasskeyPublicKey | null; signCount: number } }
  ) => { signCount: number };
  rpFor: (req: { get(name: string): string | undefined; protocol: string }) => { rpId: string; origin: string };
}

/**
 * Ключи доступа (server/lib/webauthn.js): challenge одноразовые и живут в памяти
 * этого модуля, проверка регистрации и подписи — без внешних библиотек.
 */
export const webauthn = (): WebAuthn => legacyModule<WebAuthn>("lib/webauthn.js");
