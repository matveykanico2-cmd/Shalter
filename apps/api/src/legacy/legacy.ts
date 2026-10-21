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

// --- То, что Nest берёт у ещё не перенесённых модулей (сообщения, настройки, почта, пуш, WS…) ---
// Подключаются при первом вызове: эти модули при загрузке открывают базу, а unit-тесты
// apps/api импортируют код без неё.

export interface LegacyChat {
  id: string;
  memberIds: string[];
}

/** Служебное сообщение: type "system" — строка по центру ленты; readByIds — кто уже «прочитал». */
export interface MessageExtra {
  type?: "system";
  readByIds?: string[];
}

interface SystemChat {
  findOrCreateDm: (userIdA: string, userIdB: string) => Promise<LegacyChat>;
  sendMessageAndBroadcast: (chat: LegacyChat, senderId: string, text: string, extra?: MessageExtra) => Promise<unknown>;
  serviceLine: (chat: LegacyChat, actorId: string, build: (name: string) => string | null) => Promise<unknown>;
}

/** Личный чат двоих, созданный при необходимости (server/lib/systemChat.js). */
export const findOrCreateDm = (userIdA: string, userIdB: string): Promise<LegacyChat> =>
  legacyModule<SystemChat>("lib/systemChat.js").findOrCreateDm(userIdA, userIdB);

/** Сообщение в чат с рассылкой участникам по WS (server/lib/systemChat.js). */
export const sendMessageAndBroadcast = (chat: LegacyChat, senderId: string, text: string, extra?: MessageExtra): Promise<unknown> =>
  legacyModule<SystemChat>("lib/systemChat.js").sendMessageAndBroadcast(chat, senderId, text, extra);

/** Строка в ленте от бота «Shalter»; build(имя автора) → текст или null. Ошибки только в лог (server/lib/systemChat.js). */
export const serviceLine = (chat: LegacyChat, actorId: string, build: (name: string) => string | null): Promise<unknown> =>
  legacyModule<SystemChat>("lib/systemChat.js").serviceLine(chat, actorId, build);

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
export const checkUsername = (raw: string, opts?: { forChatId?: string }): Promise<{ status: number; error: string } | null> =>
  legacyModule<{ checkUsername: (raw: string, opts?: { forChatId?: string }) => Promise<{ status: number; error: string } | null> }>(
    "lib/username.js"
  ).checkUsername(raw, opts);

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

/** Событие по WS открытым вкладкам пользователей (server/ws.js); канал каждому — со своим списком участников. */
export const broadcastToUsers = (userIds: string[], event: { type: string; [key: string]: unknown }): void =>
  legacyModule<{ broadcastToUsers: (userIds: string[], event: object) => void }>("ws.js").broadcastToUsers(userIds, event);

/** Ключ шифрования нового секретного чата, обёрнутый мастер-ключом (server/lib/textCrypto.js). */
export const newSecretChatKey = (chatId: string): string =>
  legacyModule<{ newSecretChatKey: (chatId: string) => string }>("lib/textCrypto.js").newSecretChatKey(chatId);

// Настройки пользователя (server/data/settings.js): один JSON на пользователя.
export interface ChatFlags {
  pinned?: boolean;
  archived?: boolean;
  archivedAt?: string;
  muted?: boolean;
  unread?: boolean;
}
export interface UserSettings {
  chatFlags?: Record<string, ChatFlags>;
  pinnedOrder?: string[];
  hiddenChats?: Record<string, string>;
  chatWallpapers?: Record<string, unknown>;
  notifications?: { mutedChats?: Record<string, true | string>; [key: string]: unknown };
  [key: string]: unknown;
}
interface Settings {
  getSettings: (userId: string) => Promise<UserSettings>;
  updateSettings: (userId: string, patch: Partial<UserSettings>) => Promise<UserSettings>;
  setChatCleared: (userId: string, chatId: string, iso: string) => Promise<UserSettings>;
  deleteChatForUser: (userId: string, chatId: string, iso: string) => Promise<UserSettings>;
  setChatWallpaper: (userId: string, chatId: string, wallpaper: unknown) => Promise<UserSettings>;
  setDraft: (userId: string, chatId: string, text: string) => Promise<UserSettings>;
  clearUnreadMark: (userId: string, chatId: string) => Promise<void>;
  mutedStateFor: (settings: Partial<UserSettings>, chatId: string) => { muted: boolean; mutedUntil: string | null };
}
/** Настройки пользователя: чтение, правка и точечные правки про чаты (server/data/settings.js). */
export const settings = (): Settings => legacyModule<Settings>("data/settings.js");

/** Чаты для списка: последнее сообщение, непрочитанные, личные флаги (server/data/chat-summary.js). */
interface ChatSummary {
  attachSummaries: <T extends LegacyChat>(chats: T[], userId: string) => Promise<(T & Record<string, unknown>)[]>;
  withoutHidden: <T>(summaries: T[], hiddenChats: Record<string, string> | undefined) => T[];
}
export const chatSummary = (): ChatSummary => legacyModule<ChatSummary>("data/chat-summary.js");

// Приватность (server/lib/privacyRules.js).
interface PrivacyRules {
  allowsUser: (ownerId: string, key: string, viewerId: string) => Promise<boolean>;
  recordsReadTime: (chat: LegacyChat & { type: string }, readerId: string) => Promise<boolean>;
  publicUsersFor: (users: object[], viewerId: string) => Promise<({ id: string; isBot?: boolean } & Record<string, unknown>)[]>;
}
export const privacyRules = (): PrivacyRules => legacyModule<PrivacyRules>("lib/privacyRules.js");

/** Цена сообщения незнакомцу и надо ли платить отправителю (server/lib/messagePrice.js). */
export const messageCost = (senderId: string, other: object, chatId: string): Promise<{ price: number; mustPay: boolean }> =>
  legacyModule<{ messageCost: (senderId: string, other: object, chatId: string) => Promise<{ price: number; mustPay: boolean }> }>(
    "lib/messagePrice.js"
  ).messageCost(senderId, other, chatId);

// Сообщения (server/data/messages.js).
export interface MessagesPage {
  messages: ({ senderId?: string; visibleToId?: string; threadRootId?: string } & Record<string, unknown>)[];
  hasMore: boolean;
}
interface Messages {
  listMessagesPage: (chatId: string, viewerId: string, clearedBefore: undefined, opts: { limit: number }) => MessagesPage;
  deleteMessagesForChat: (chatId: string) => Promise<void>;
  markChatRead: (chatId: string, viewerId: string, opts: { recordTime: boolean }) => Promise<string[]>;
}
export const messages = (): Messages => legacyModule<Messages>("data/messages.js");

// Заявки на вступление и приветствие (server/lib/joinApproval.js): их же подаёт и решает бот-админ.
interface JoinApproval {
  sendWelcome: (chat: LegacyChat, userId: string) => Promise<void>;
  submitJoinRequest: (chat: LegacyChat, userId: string) => Promise<void>;
  /** Бросает Error со status (404, 403, 409). */
  decideJoinRequest: (chatId: string, userId: string, approve: boolean, actorId: string) => Promise<{ approved: boolean; chat: LegacyChat }>;
}
export const joinApproval = (): JoinApproval => legacyModule<JoinApproval>("lib/joinApproval.js");

/** Удаление чата модератором Shalter: с уведомлением владельца и записью в журнал (server/lib/moderationDelete.js). */
export const moderateDeleteChat = (chat: LegacyChat, opts: { adminId: string; reason: string }): Promise<void> =>
  legacyModule<{ moderateDeleteChat: (chat: LegacyChat, opts: object) => Promise<void> }>("lib/moderationDelete.js").moderateDeleteChat(chat, opts);

/**
 * В значении есть чужой загруженный файл, которого не было в previous (server/lib/uploadAccess.js):
 * сославшись на него, файл можно было бы открыть всем.
 */
export const usesForeignUpload = (userId: string, value: unknown, previous?: unknown): boolean =>
  legacyModule<{ usesForeignUpload: (userId: string, value: unknown, previous?: unknown) => boolean }>("lib/uploadAccess.js").usesForeignUpload(
    userId,
    value,
    previous
  );

/** Ссылка на свой загруженный файл, data: или http(s) (server/lib/sanitizeAttachments.js). */
export const isSafeUrl = (url: unknown): boolean =>
  legacyModule<{ isSafeUrl: (url: unknown) => boolean }>("lib/sanitizeAttachments.js").isSafeUrl(url);

/** Бот по его пользователю (server/data/bots.js): здесь нужны только его команды. */
export const getBotByUserId = (userId: string): Promise<{ commands?: unknown[] } | undefined> =>
  legacyModule<{ getBotByUserId: (userId: string) => Promise<{ commands?: unknown[] } | undefined> }>("data/bots.js").getBotByUserId(userId);

// «Печатает…» (server/data/typing.js): в памяти процесса, его же ставят боты и Shalter AI.
interface Typing {
  markTyping: (chatId: string, userId: string, action: string) => void;
  clearTyping: (chatId: string, userId: string) => void;
  getTyping: (chatId: string, viewerId: string) => { userId: string; action: string } | null;
  normalizeAction: (action: unknown) => string;
}
export const typing = (): Typing => legacyModule<Typing>("data/typing.js");
