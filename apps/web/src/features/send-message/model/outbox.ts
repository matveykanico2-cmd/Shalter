// Очередь исходящих: своё сообщение лежит здесь (и в IndexedDB) с нажатия «Отправить» до
// ответа сервера. Обрыв сети, таймаут, 5xx, 429 — повтор, сколько бы ни заняло: пузырь
// «отправляется» не пропадает, а закрытое приложение досылает очередь при следующем запуске.
// Дубля не будет: clientId сервер хранит в базе (messages.clientId). Отказ по существу (4xx:
// нет прав, слишком длинно) — пузырь убираем, ошибка уходит отправителю.
// В одном чате сообщения уходят строго по очереди — порядок не перемешается.
//
// Фото, видео и файлы — тоже здесь: пузырь с локальными превью и прогрессом в ленте сразу,
// файлы грузятся в фоне (большие — частями с продолжением), с паузой и отменой; сами файлы
// лежат в IndexedDB, и после перезапуска загрузка продолжается с принятого сервером места.
import type { QueryClient } from "@tanstack/react-query";

import { chatCache } from "@/entities/chat";
import { type FeedMessage, historyCache, type Message, setPendingSource } from "@/entities/message";

import { ApiError, cancelUploadSession, UPLOAD_CANCELLED, type Uploaded, UploadError, uploadFile, type UploadKind } from "@/shared/api";
import { idbDelete, idbEntries, idbPut } from "@/shared/lib/idb-store";
import { onCacheCleared } from "@/shared/lib/local-cache";
import { toast } from "@/shared/ui";

import { type OutgoingAttachment, type SendBody, sendMessage, sendTyping } from "../api/send-message";
import { uploadActionFor } from "../lib/files";

/** Файл сообщения: ещё не загружен (sessionId — начатая загрузка частями) или уже загружен. */
export type OutboxFile = { file: File; kind: UploadKind; spoiler?: boolean; sessionId?: string; uploaded?: Uploaded };

export type OutboxEntry = {
  userId: string;
  chatId: string;
  channel: boolean;
  body: SendBody;
  /** Пузырь в ленте: id = body.clientId. */
  pending: FeedMessage;
  createdAt: number;
  /** Файлы — встают во вложения после body.attachments, когда загрузятся. */
  files?: OutboxFile[];
  /**
   * Дополнение тела, которое готовится параллельно с загрузкой (размытая миниатюра платного
   * поста): отправка его дожидается. Только в памяти — после перезапуска уходит без него.
   */
  extra?: Promise<Partial<SendBody>>;
};

/** Сколько ждём ответа на одну попытку: дольше — соединение «повисло», пробуем снова. */
export const ATTEMPT_TIMEOUT_MS = 30_000;
const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 30_000;

const STORE = "outbox";
const entries = new Map<string, OutboxEntry>();
const queues = new Map<string, Promise<void>>();
const waiters = new Map<string, { resolve: (m: Message) => void; reject: (err: unknown) => void }>();
/** Загрузка файлов сообщения: идёт сразу, не дожидаясь очереди чата. */
const uploads = new Map<string, Promise<void>>();
const controllers = new Map<string, AbortController>();
const paused = new Map<string, () => void>();
const blobUrls = new Map<string, string[]>();
let generation = 0;

onCacheCleared(() => {
  // Выход: очередь вышедшего не досылается и не остаётся на устройстве (база уже стёрта).
  generation++;
  controllers.forEach((c) => c.abort());
  controllers.clear();
  paused.clear();
  entries.clear();
  for (const w of waiters.values()) w.reject(new Error("signed out"));
  waiters.clear();
});

setPendingSource((chatId) => [...entries.values()].filter((e) => e.chatId === chatId).map((e) => e.pending));

/** Новая метка отправки: уникальна и после перезапуска приложения. */
export function newClientId() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `c_${random}`;
}

/** Повторять ли: сеть, таймаут, сервер перегружен или недоступен. Остальное — отказ по существу. */
export function isRetryable(err: unknown) {
  if (err instanceof UploadError) return err.retryable;
  if (err instanceof ApiError) return err.status >= 500 || err.status === 429 || err.status === 408;
  // fetch без сети — TypeError, наш таймаут — AbortError/TimeoutError.
  return err instanceof TypeError || (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError"));
}

const isCancelled = (err: unknown) => err instanceof UploadError && err.message === UPLOAD_CANCELLED;

/** Пауза перед следующей попыткой: растёт до MAX_DELAY_MS; появилась сеть — сразу. */
function pause(attempt: number) {
  const delay = Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, delay);
    window.addEventListener("online", done);
  });
}

async function attempt(entry: OutboxEntry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ATTEMPT_TIMEOUT_MS);
  try {
    return await sendMessage(entry.chatId, withUploaded(entry), entry.channel, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Тело отправки с загруженными файлами во вложениях. */
function withUploaded(entry: OutboxEntry): SendBody {
  if (!entry.files?.length) return entry.body;
  const files: OutgoingAttachment[] = entry.files.flatMap((f) => (f.uploaded ? [f.spoiler && (f.kind === "image" || f.kind === "video") ? { ...f.uploaded, spoiler: true as const } : f.uploaded] : []));
  return { ...entry.body, attachments: [...(entry.body.attachments ?? []), ...files] };
}

/** На устройство — без extra (промис в IndexedDB не кладётся). */
const save = (entry: OutboxEntry) => void idbPut(STORE, entry.body.clientId, { ...entry, extra: undefined });

function forget(entry: OutboxEntry) {
  const id = entry.body.clientId;
  entries.delete(id);
  uploads.delete(id);
  controllers.delete(id);
  paused.delete(id);
  void idbDelete(STORE, [id]);
  // Превью из памяти — когда ленту уже заменило сообщение сервера.
  const urls = blobUrls.get(id);
  blobUrls.delete(id);
  if (urls) setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
}

// --- пузырь: локальные превью файлов и прогресс ------------------------------------------------

type UploadState = "uploading" | "paused";

/** Вложения пузыря: уже готовые из body, затем файлы — локальными превью, с прогрессом. */
function pendingAttachments(entry: OutboxEntry, progress: number[], state: UploadState) {
  const urls = blobUrls.get(entry.body.clientId) ?? [];
  const files = (entry.files ?? []).map((f, i) => {
    const url = urls[i] ?? "";
    const kind = f.kind === "image" || f.kind === "video" ? f.kind : "file";
    return {
      kind,
      url,
      ...(kind === "image" || kind === "video" ? { thumbUrl: url } : {}),
      name: f.file.name,
      size: f.file.size,
      mimeType: f.file.type,
      ...(f.spoiler ? { spoiler: true } : {}),
      uploadProgress: f.uploaded ? 1 : (progress[i] ?? 0),
      uploadState: state,
    };
  });
  return [...(entry.body.attachments ?? []), ...files] as FeedMessage["attachments"];
}

function showProgress(client: QueryClient, entry: OutboxEntry, progress: number[], state: UploadState) {
  const attachments = pendingAttachments(entry, progress, state);
  entry.pending = { ...entry.pending, attachments };
  historyCache.patch(client, entry.chatId, entry.body.clientId, (m) => ({ ...m, attachments }));
}

/** Пауза снята или звонок resume — ждём. */
function whilePaused(id: string) {
  return new Promise<void>((resolve) => {
    if (!paused.has(id)) return resolve();
    paused.set(id, resolve);
  });
}

/**
 * Загрузить файлы сообщения (по три за раз — общий лимит uploadFile). Пауза обрывает текущие
 * запросы, сессии частей остаются; продолжение — с принятого места. Ошибка по существу
 * (слишком большой, недопустимый тип) — исключение, сообщение не уходит.
 */
async function uploadFiles(client: QueryClient, entry: OutboxEntry, gen: number) {
  const id = entry.body.clientId;
  const files = entry.files ?? [];
  const progress: number[] = files.map((f) => (f.uploaded ? 1 : 0));
  let lastShown = 0;
  const show = (force = false) => {
    if (gen !== generation || !entries.has(id)) return;
    const now = Date.now();
    if (!force && now - lastShown < 200) return;
    lastShown = now;
    showProgress(client, entry, progress, paused.has(id) ? "paused" : "uploading");
  };
  show(true);
  // У собеседника — «отправляет фото…», пока файлы грузятся; в конце — отбой.
  const action = uploadActionFor(files.map((f) => f.kind));
  const typing = () => sendTyping(entry.chatId, action).catch(() => {});
  void typing();
  const ping = setInterval(() => {
    if (!paused.has(id)) void typing();
  }, 2500);
  try {
    await uploadLoop(entry, gen, files, progress, show);
  } finally {
    clearInterval(ping);
    sendTyping(entry.chatId, "cancel").catch(() => {});
  }
}

async function uploadLoop(entry: OutboxEntry, gen: number, files: OutboxFile[], progress: number[], show: (force?: boolean) => void) {
  const id = entry.body.clientId;
  for (let n = 0; files.some((f) => !f.uploaded); n++) {
    if (gen !== generation || !entries.has(id)) throw new UploadError(UPLOAD_CANCELLED);
    await whilePaused(id);
    show(true);
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      await Promise.all(
        files.map(async (f, i) => {
          if (f.uploaded) return;
          const session = { id: f.sessionId };
          let savedSession = f.sessionId;
          f.uploaded = await uploadFile(f.file, f.kind, {
            signal: controller.signal,
            session,
            onProgress: (p) => {
              progress[i] = p;
              // Сессия частей началась — на устройство: после перезапуска продолжим с неё.
              if (session.id && session.id !== savedSession) {
                savedSession = f.sessionId = session.id;
                save(entry);
              }
              show();
            },
          });
          f.sessionId = undefined;
          progress[i] = 1;
          save(entry);
          show(true);
        })
      );
    } catch (err) {
      if (gen !== generation || !entries.has(id)) throw new UploadError(UPLOAD_CANCELLED);
      // Пауза — ждём продолжения, начатые сессии остаются.
      if (isCancelled(err) && paused.has(id)) continue;
      if (!isRetryable(err)) throw err;
      await pause(Math.min(n, 5));
    } finally {
      if (controllers.get(id) === controller) controllers.delete(id);
    }
  }
}

function startUploads(client: QueryClient, entry: OutboxEntry) {
  if (!entry.files?.some((f) => !f.uploaded)) return;
  const id = entry.body.clientId;
  if (!blobUrls.has(id)) blobUrls.set(id, entry.files.map((f) => URL.createObjectURL(f.file)));
  const running = uploadFiles(client, entry, generation);
  running.catch(() => {});
  uploads.set(id, running);
}

/** Пауза загрузки файлов сообщения. */
export function pauseOutgoing(client: QueryClient, clientId: string) {
  const entry = entries.get(clientId);
  if (!entry || paused.has(clientId) || !uploads.has(clientId)) return;
  paused.set(clientId, () => {});
  controllers.get(clientId)?.abort();
  showProgress(client, entry, (entry.files ?? []).map((f) => (f.uploaded ? 1 : 0)), "paused");
}

/** Продолжить загрузку с места остановки. */
export function resumeOutgoing(clientId: string) {
  const wake = paused.get(clientId);
  paused.delete(clientId);
  wake?.();
}

/** Отменить отправку: загрузка останавливается, пузырь убирается, сессии на сервере закрываются. */
export function cancelOutgoing(client: QueryClient, clientId: string) {
  const entry = entries.get(clientId);
  if (!entry) return;
  // Сначала обрываем запросы и будим паузу — forget() уберёт их из таблиц.
  controllers.get(clientId)?.abort();
  paused.get(clientId)?.();
  forget(entry);
  for (const f of entry.files ?? []) if (f.sessionId) cancelUploadSession(f.sessionId);
  historyCache.dropPending(client, entry.chatId, clientId);
  const waiter = waiters.get(clientId);
  waiters.delete(clientId);
  waiter?.reject(new UploadError(UPLOAD_CANCELLED));
}

// --- отправка --------------------------------------------------------------------------------

function fail(client: QueryClient, entry: OutboxEntry, err: unknown) {
  const id = entry.body.clientId;
  forget(entry);
  // Начатые загрузки частями больше не нужны — освобождаем место на сервере.
  for (const f of entry.files ?? []) if (f.sessionId) cancelUploadSession(f.sessionId);
  historyCache.dropPending(client, entry.chatId, id);
  const waiter = waiters.get(id);
  waiters.delete(id);
  // Отправитель ждёт ответа (поле ввода вернёт текст); досылка после перезапуска — тостом.
  if (waiter) waiter.reject(err);
  else if (!isCancelled(err)) toast(`Сообщение не отправлено: ${err instanceof Error ? err.message : "ошибка"}`, { error: true });
}

async function deliver(client: QueryClient, entry: OutboxEntry, gen: number) {
  const id = entry.body.clientId;
  if (entry.extra) {
    const more = await entry.extra.catch(() => ({}));
    entry.extra = undefined;
    if (gen !== generation || !entries.has(id)) return;
    entry.body = { ...entry.body, ...more };
    save(entry);
  }
  for (let n = 0; ; n++) {
    if (gen !== generation || !entries.has(id)) return;
    try {
      const { message } = await attempt(entry);
      if (gen !== generation) return;
      forget(entry);
      historyCache.confirmPending(client, entry.chatId, id, message);
      chatCache.noteMessage(client, entry.chatId, message);
      waiters.get(id)?.resolve(message);
      waiters.delete(id);
      return;
    } catch (err) {
      if (gen !== generation) return;
      if (!isRetryable(err)) return fail(client, entry, err);
      await pause(n);
    }
  }
}

/**
 * Поставить в очередь своего чата: следующее уйдёт только после предыдущего. Сообщение с
 * файлами встаёт в очередь, когда файлы загрузились: долгая (или приостановленная) загрузка
 * не держит текст, отправленный после неё, — как в Telegram, он уходит раньше.
 */
function schedule(client: QueryClient, entry: OutboxEntry) {
  const gen = generation;
  const id = entry.body.clientId;
  startUploads(client, entry);
  const upload = uploads.get(id);
  if (!upload) return appendToQueue(client, entry, gen);
  upload.then(
    () => {
      if (gen === generation && entries.has(id)) appendToQueue(client, entry, gen);
    },
    (err: unknown) => {
      if (gen === generation && entries.has(id)) fail(client, entry, err);
    }
  );
}

function appendToQueue(client: QueryClient, entry: OutboxEntry, gen: number) {
  const prev = queues.get(entry.chatId) ?? Promise.resolve();
  const next = prev.then(() => deliver(client, entry, gen));
  queues.set(entry.chatId, next);
  void next.finally(() => {
    if (queues.get(entry.chatId) === next) queues.delete(entry.chatId);
  });
}

/**
 * Отправить через очередь: пузырь сразу в ленте, запись на устройстве до ответа сервера.
 * Промис — сообщение от сервера; отказ по существу или отмена — ошибка (пузырь уже убран).
 */
export function enqueue(client: QueryClient, entry: OutboxEntry): Promise<Message> {
  const id = entry.body.clientId;
  entries.set(id, entry);
  save(entry);
  if (entry.files?.length) {
    blobUrls.set(id, entry.files.map((f) => URL.createObjectURL(f.file)));
    entry.pending = { ...entry.pending, attachments: pendingAttachments(entry, [], "uploading") };
  }
  historyCache.addPending(client, entry.chatId, entry.pending);
  const result = new Promise<Message>((resolve, reject) => waiters.set(id, { resolve, reject }));
  schedule(client, entry);
  return result;
}

/** Запуск приложения: что не ушло в прошлый раз (закрыли без сети), — снова в ленты и в отправку. */
export async function resumeOutbox(client: QueryClient, userId: string) {
  const gen = generation;
  const stored = await idbEntries<OutboxEntry>(STORE);
  if (gen !== generation) return;
  const mine = stored
    .map(([, e]) => e)
    .filter((e) => e?.userId === userId && typeof e.body?.clientId === "string" && !entries.has(e.body.clientId))
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const entry of mine) {
    entries.set(entry.body.clientId, entry);
    // Адреса превью прошлого запуска недействительны — заново из сохранённых файлов.
    if (entry.files?.length) {
      blobUrls.set(entry.body.clientId, entry.files.map((f) => URL.createObjectURL(f.file)));
      entry.pending = { ...entry.pending, attachments: pendingAttachments(entry, entry.files.map((f) => (f.uploaded ? 1 : 0)), "uploading") };
    }
    historyCache.addPending(client, entry.chatId, entry.pending);
    schedule(client, entry);
  }
}
