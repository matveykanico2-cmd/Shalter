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

/** Шлюз WebSocket Nest для старого кода: события server/ и фонового процесса идут в него. */
export interface LegacyRealtimeHub {
  broadcastToUsers: (userIds: Iterable<string>, message: { type: string }) => void;
  sendPayload: (userIds: Iterable<string>, payload: string, chatId: unknown) => void;
  stats: () => { onlineUsers: number; sockets: number };
}

export const startLegacyRuntime = (server: Server, listen: (port: number | string) => unknown, realtime: LegacyRealtimeHub): Promise<unknown> =>
  require(path.join(LEGACY_DIR, "runtime.js")).startRuntime(server, listen, { realtime });

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

/** Служебное сообщение: type "system" — строка по центру ленты, "call" — итог звонка; readByIds — кто уже «прочитал». */
export interface MessageExtra {
  type?: "system" | "call";
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
export const checkUsername = (raw: string, opts?: { forChatId?: string; forUserId?: string }): Promise<{ status: number; error: string } | null> =>
  legacyModule<{ checkUsername: (raw: string, opts?: { forChatId?: string; forUserId?: string }) => Promise<{ status: number; error: string } | null> }>(
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
  chatClears?: Record<string, string>;
  drafts?: Record<string, unknown>;
  privacy?: { messages?: string; exceptions?: Record<string, { allow?: string[]; deny?: string[] }>; [key: string]: unknown };
  notifications?: { mutedChats?: Record<string, true | string>; previewText?: boolean; [key: string]: unknown };
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
  /** Чат заглушён сейчас (навсегда или до mutedUntil). */
  isQuietNow: (settings: Partial<UserSettings>, chatId: string) => boolean;
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
  publicUserFor: (user: object, viewerId: string) => Promise<Record<string, unknown>>;
  /** Имя из контактов смотрящего вместо имени профиля, пометки inContacts и mutualContact. */
  applyContactName: <T extends object>(visible: T, myContact: ContactRow | null | undefined, theyHaveMe: boolean) => T;
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

/** Бот по его пользователю (server/data/bots.js): команды и код для песочницы. */
export interface LegacyBot {
  commands?: unknown[];
  code?: string;
}
export const getBotByUserId = (userId: string): Promise<LegacyBot | undefined> =>
  legacyModule<{ getBotByUserId: (userId: string) => Promise<LegacyBot | undefined> }>("data/bots.js").getBotByUserId(userId);

// «Печатает…» (server/data/typing.js): в памяти процесса, его же ставят боты и Shalter AI.
interface Typing {
  markTyping: (chatId: string, userId: string, action: string) => void;
  clearTyping: (chatId: string, userId: string) => void;
  getTyping: (chatId: string, viewerId: string) => { userId: string; action: string } | null;
  normalizeAction: (action: unknown) => string;
}
export const typing = (): Typing => legacyModule<Typing>("data/typing.js");

// --- Для сообщений (modules/messages) ---

// Шифрование переписки (server/lib/textCrypto.js). Те же функции, ключи и ротация
// ключей (server/lib/keyring.js), что у server/: шифротекст байт в байт тот же.
interface TextCrypto {
  encryptText: (id: string, text: string | null | undefined) => string;
  decryptText: (id: string, stored: string | null | undefined) => string;
  isEncrypted: (stored: unknown) => boolean;
  /** FTS-запрос по словам из строки поиска; null — искать нечего. */
  searchQuery: (query: string) => string | null;
  hasLink: (text: string | null | undefined) => 0 | 1;
  sealSecret: (chatId: string, wrapped: string, messageId: string, text: string | null | undefined) => string;
  openSecret: (chatId: string, wrapped: string | null, messageId: string, text: string) => string;
}
export const textCrypto = (): TextCrypto => legacyModule<TextCrypto>("lib/textCrypto.js");

// Доступ участников чата к загруженным файлам (server/lib/uploadAccess.js).
interface UploadAccess {
  registerAttachments: (chatId: string, attachments: unknown, opts?: { by?: string }) => void;
  revokeAttachments: (chatId: string, refs: { url: string }[]) => void;
  canAccessUpload: (userId: string, filename: string) => boolean;
}
export const uploadAccess = (): UploadAccess => legacyModule<UploadAccess>("lib/uploadAccess.js");

/** Вложение сообщения после очистки (server/lib/sanitizeAttachments.js). */
export interface Attachment {
  kind: string;
  url?: string;
  thumbUrl?: string;
  name?: string;
  transcript?: string;
  meta?: Record<string, any>;
  [key: string]: unknown;
}

// Очистка того, что клиент кладёт в сообщение: вложения, стикер, сцена эмодзи.
interface Sanitizers {
  sanitizeAttachments: (raw: unknown) => Attachment[] | undefined;
  MAX_CHECKLIST_ITEMS: number;
  sanitizeSticker: (raw: unknown) => ({ kind?: string; url?: string; emoji?: string } & Record<string, unknown>) | undefined;
  sanitizeScene: (raw: unknown, opts?: { requireLayers?: boolean }) => unknown;
}
export const sanitizers = (): Sanitizers => ({
  ...legacyModule<Pick<Sanitizers, "sanitizeAttachments" | "MAX_CHECKLIST_ITEMS">>("lib/sanitizeAttachments.js"),
  sanitizeSticker: legacyModule<Pick<Sanitizers, "sanitizeSticker">>("lib/sanitizeSticker.js").sanitizeSticker,
  sanitizeScene: legacyModule<Pick<Sanitizers, "sanitizeScene">>("lib/sanitizeScene.js").sanitizeScene,
});

// Звёзды (server/data/stars.js).
interface Stars {
  /** false — не хватает звёзд, ничего не списано. */
  transferStars: (fromId: string, toId: string, amount: number) => boolean;
  balanceOf: (userId: string) => number;
}
export const stars = (): Stars => legacyModule<Stars>("data/stars.js");

// Платные посты (server/data/paidMedia.js): настоящие вложения и покупки.
export interface PaidMediaRecord {
  messageId: string;
  chatId: string;
  stars: number;
  attachments: Attachment[];
}
interface PaidMedia {
  savePaidMedia: (messageId: string, chatId: string, stars: number, attachments: Attachment[]) => void;
  getPaidMedia: (messageId: string) => PaidMediaRecord | undefined;
  hasBought: (messageId: string, userId: string) => boolean;
  recordPurchase: (messageId: string, userId: string) => void;
  buyersCount: (messageId: string) => number;
}
export const paidMedia = (): PaidMedia => legacyModule<PaidMedia>("data/paidMedia.js");

// Отложенные сообщения (server/data/scheduledMessages.js); их отправляет server/lib/scheduledMessagesSweep.js.
export interface ScheduledMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  attachments?: Attachment[];
  sendAt: string;
  [key: string]: unknown;
}
interface Scheduled {
  WHEN_ONLINE: string;
  listScheduledFor: (chatId: string, senderId: string) => Promise<ScheduledMessage[]>;
  getScheduled: (id: string) => Promise<ScheduledMessage | undefined>;
  addScheduled: (msg: Record<string, unknown>) => Promise<ScheduledMessage>;
  editScheduled: (id: string, patch: { text?: unknown; sendAt?: unknown; repeat?: unknown }) => Promise<ScheduledMessage | undefined>;
  deleteScheduled: (id: string) => Promise<void>;
}
interface ScheduledSweep {
  sweepOnce: () => Promise<void>;
  sendWhenOnline: () => Promise<void>;
}
export const scheduled = (): Scheduled & ScheduledSweep => ({
  ...legacyModule<Scheduled>("data/scheduledMessages.js"),
  ...legacyModule<ScheduledSweep>("lib/scheduledMessagesSweep.js"),
});

// Кто отвечает на новое сообщение: код бота в песочнице, Хьюго, Shalter AI, бот помощи,
// автоответ бизнес-аккаунта. Ошибки они пишут в лог сами (кроме runBotCode).
interface Responders {
  runBotCode: (bot: LegacyBot, code: string, msg: object) => Promise<unknown>;
  dispatchHugo: (chatId: string, message: object) => void;
  dispatchGuestHugo: (chat: object, message: object) => void;
  dispatchShalterAi: (chatId: string, message: object) => void;
  dispatchHelperBot: (chat: object, message: object) => void;
  dispatchBusinessAutoReply: (chat: object, message: object) => void;
}
export const responders = (): Responders => ({
  runBotCode: legacyModule<Pick<Responders, "runBotCode">>("lib/botSandbox.js").runBotCode,
  ...legacyModule<Pick<Responders, "dispatchHugo" | "dispatchGuestHugo">>("lib/hugoBot.js"),
  dispatchShalterAi: legacyModule<Pick<Responders, "dispatchShalterAi">>("lib/shalterAi.js").dispatchShalterAi,
  dispatchHelperBot: legacyModule<Pick<Responders, "dispatchHelperBot">>("lib/helperBot.js").dispatchHelperBot,
  dispatchBusinessAutoReply: legacyModule<Pick<Responders, "dispatchBusinessAutoReply">>("lib/businessAutoReply.js").dispatchBusinessAutoReply,
});

// Пуш-уведомления (server/push.js).
interface PushFull {
  sendPushToUser: (userId: string, payload: object, options?: object) => Promise<unknown>;
  pushAvatar: (entity: object | null | undefined) => Record<string, unknown>;
  userPushAvatar: (user: object | null | undefined, viewerId: string) => Promise<Record<string, unknown>>;
  MESSAGE_PUSH: object;
  CALL_PUSH: object;
  CALL_CANCEL_PUSH: object;
}
export const push = (): PushFull => legacyModule<PushFull>("push.js");

/** Превью ссылки из текста (server/lib/linkPreview.js); null — ссылки нет или она не открылась. */
export const fetchLinkPreview = (text: string): Promise<unknown> =>
  legacyModule<{ fetchLinkPreview: (text: string) => Promise<unknown> }>("lib/linkPreview.js").fetchLinkPreview(text);

// Превью и длительность вложений считает фоновый процесс (server/lib/mediaJobs.js, background_jobs).
interface MediaJobs {
  markPendingPreviews: (attachments: Attachment[] | undefined) => Attachment[] | undefined;
  messageNeedsMedia: (message: object) => boolean;
}
export const mediaJobs = (): MediaJobs => legacyModule<MediaJobs>("lib/mediaJobs.js");
export const queueJob = (kind: string, payload: object): void =>
  legacyModule<{ queueJob: (kind: string, payload: object) => void }>("lib/backgroundJobs.js").queueJob(kind, payload);

/**
 * Повтор отправки с тем же clientId получает ответ первой (server/lib/sendOnce.js). Память
 * общая со старыми маршрутами (Bot API, посты, отложенные). Ошибка run() не запоминается.
 */
export const sendOnce = <T>(userId: string, chatId: string, clientId: unknown, run: () => Promise<T>): Promise<T> =>
  legacyModule<{ sendOnce: (userId: string, chatId: string, clientId: unknown, run: () => Promise<T>) => Promise<T> }>("lib/sendOnce.js").sendOnce(
    userId,
    chatId,
    clientId,
    run
  );

// ИИ-сводка текста (server/lib/hugoAi.js).
interface HugoAi {
  isAiAvailable: () => boolean;
  /** null — модель не ответила. */
  summarize: (text: string) => Promise<string | null>;
}
export const hugoAi = (): HugoAi => legacyModule<HugoAi>("lib/hugoAi.js");

// --- Файлы: хранение, шифрование и сжатие остаются в server/ (как текст сообщений) ---

// Лимиты загрузки по видам файлов (server/lib/uploadLimits.js), общие с подарками и админкой.
interface UploadLimits {
  UPLOAD_LIMITS: Record<string, number>;
  DEFAULT_LIMIT: number;
  UPLOADABLE_KINDS: Set<string>;
  limitFor: (kind: string) => number;
  tooLargeError: (kind: string) => string;
}
export const uploadLimits = (): UploadLimits => legacyModule<UploadLimits>("lib/uploadLimits.js");

/** Куда пишется загрузка: диск или S3 (server/lib/storage.js). plain — без шифрования приложением (его делает бакет). */
export interface WriteTarget {
  stream: NodeJS.WritableStream;
  done: () => Promise<unknown>;
  abort: () => void;
  plain: boolean;
}
interface Storage {
  createWriteTarget: (filename: string, opts: { contentType?: string }) => WriteTarget;
  /** Переименовывает загрузку в sha_… или, если такой файл уже есть, удаляет её; возвращает итоговое имя. */
  finalizeDedup: (tempName: string, dedupName: string) => Promise<string>;
  deleteObject: (filename: string) => Promise<unknown>;
}
export const storage = (): Storage => legacyModule<Storage>("lib/storage.js");

/** Поток, шифрующий файл ключом из каталога data (server/lib/fileCrypto.js). */
export const createEncryptStream = (dataDir: string, out: NodeJS.WritableStream): NodeJS.ReadWriteStream =>
  legacyModule<{ createEncryptStream: (dataDir: string, out: NodeJS.WritableStream) => NodeJS.ReadWriteStream }>("lib/fileCrypto.js").createEncryptStream(
    dataDir,
    out
  );

// Сжатие brotli с меткой в начале файла (server/lib/fileCompression.js).
interface FileCompression {
  MAGIC: Buffer;
  compressStream: (declaredSize: number) => NodeJS.ReadWriteStream;
}
export const fileCompression = (): FileCompression => legacyModule<FileCompression>("lib/fileCompression.js");

// Отдача файла (server/lib/serveUpload.js): расшифровка, распаковка, Range, редирект в бакет.
interface ServeUpload {
  serveUpload: () => RequestHandler;
  contentTypeFor: (filename: string) => string | undefined;
}
export const serveUpload = (): ServeUpload => legacyModule<ServeUpload>("lib/serveUpload.js");

// --- WebSocket: шлюз в Nest (modules/realtime), а это — то, что ему нужно из server/ ---

/** Подписка на отзыв доступа (сеанс, пароль, бан, удаление; в том числе из фонового процесса). */
export const onAccessRevoked = (fn: (userId: string) => void): void =>
  legacyModule<{ onAccessRevoked: (fn: (userId: string) => void) => void }>("lib/sessionEvents.js").onAccessRevoked(fn);

/** Id тех, кто у пользователя в контактах (server/data/contacts.js). */
export const contactIdsOf = async (ownerId: string): Promise<Set<string>> => {
  const rows = await legacyModule<{ listContactsFor: (ownerId: string) => Promise<{ userId: string }[]> }>("data/contacts.js").listContactsFor(ownerId);
  return new Set(rows.map((c) => c.userId));
};

/** Пускает ли правило приватности key (lastSeen, …) этого зрителя (server/lib/privacyRules.js). */
export const privacyAllows = (privacy: UserSettings["privacy"], key: string, viewerId: string, isContact: boolean): boolean =>
  legacyModule<{ privacyAllows: (privacy: unknown, key: string, viewerId: string, isContact: boolean) => boolean }>("lib/privacyRules.js").privacyAllows(
    privacy,
    key,
    viewerId,
    isContact
  );

// Канал в событии: подписчику — без списка подписчиков (server/lib/chatForViewer.js).
interface ChatForViewer {
  hidesMembers: (chat: unknown, uid: string) => boolean;
  chatForViewer: <T>(chat: T, uid: string) => T;
}
export const chatForViewer = (): ChatForViewer => legacyModule<ChatForViewer>("lib/chatForViewer.js");

// Прямые эфиры (server/data/liveStreams.js).
interface LiveStreams {
  getStream: (id: unknown) => { id: string; status: string } | undefined;
  getParticipant: (streamId: unknown, userId: unknown) => object | undefined;
}
export const liveStreams = (): LiveStreams => legacyModule<LiveStreams>("data/liveStreams.js");

// --- Звонки (modules/calls) ---

/** STUN и, если настроен, TURN с временными учётными данными (server/lib/turnCredentials.js). */
export const iceServers = (): object[] => legacyModule<{ getIceServers: () => object[] }>("lib/turnCredentials.js").getIceServers();

// --- Профиль (modules/profiles) ---

/** Строка контакта как в таблице contacts (server/data/contacts.js); заметка зашифрована. */
export interface ContactRow {
  id: string;
  ownerId: string;
  userId: string;
  localName: string | null;
  note: string | null;
  [key: string]: unknown;
}
interface Contacts {
  listContactsFor: (ownerId: string) => Promise<ContactRow[]>;
  /** Кто держит пользователя у себя в контактах. */
  listOwnersOf: (userId: string) => string[];
  /** Расшифрованная заметка к контакту или null. */
  contactNote: (row: ContactRow | null | undefined) => string | null;
}
export const contacts = (): Contacts => legacyModule<Contacts>("data/contacts.js");

/** Открыто ли сейчас по расписанию бизнеса и до скольки / когда откроется (server/lib/businessHours.js). */
export const businessStatus = (hours: unknown, timeZone: unknown): object =>
  legacyModule<{ businessStatus: (hours: unknown, timeZone: unknown) => object }>("lib/businessHours.js").businessStatus(hours, timeZone);

/** Сколько разных людей в чатах с ботом (server/data/bots.js). */
export const countBotAudience = (botUserId: string): number =>
  legacyModule<{ countBotAudience: (botUserId: string) => number }>("data/bots.js").countBotAudience(botUserId);

/** Подарки на полке с текущими именем и аватаром отправителя глазами смотрящего (server/lib/giftSenders.js). */
export const withGiftSenders = <T>(gifts: T[], viewerId: string): Promise<T[]> =>
  legacyModule<{ withGiftSenders: <G>(gifts: G[], viewerId: string) => Promise<G[]> }>("lib/giftSenders.js").withGiftSenders(gifts, viewerId);

/** Ссылка /uploads/… на существующий файл, который загрузил сам пользователь (server/lib/uploadAccess.js). */
export const isOwnUploadUrl = (userId: string, url: string): Promise<boolean> =>
  legacyModule<{ isOwnUploadUrl: (userId: string, url: string) => Promise<boolean> }>("lib/uploadAccess.js").isOwnUploadUrl(userId, url);
