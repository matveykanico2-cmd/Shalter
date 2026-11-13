// Загрузка файла (POST /api/uploads) — как public/js/lib/upload.js: XHR ради прогресса,
// не больше трёх одновременно, повтор после сбоя сети или 5xx (через 1 и 3 с).
import { withoutPhotoMetadata } from "../lib/strip-exif";

const MAX_PARALLEL = 3;
const RETRY_DELAYS_MS = [1000, 3000];
// Ни байта за минуту — соединение мертво (сменилась сеть, уснул телефон): обрываем и
// пробуем снова, а не висим на «загрузке» вечно.
const STALL_MS = 60_000;

export type UploadKind = "image" | "video" | "file" | "voice" | "video-note" | "gift" | "avatar" | "avatar-video" | "profile-track";

export type Uploaded = { kind: UploadKind; url: string; name?: string; size?: number; mimeType?: string };

export class UploadError extends Error {
  public constructor(
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export const UPLOAD_CANCELLED = "Загрузка отменена";

let running = 0;
const waiting: (() => void)[] = [];
// Отменённая в очереди загрузка уходит из неё сразу, а не ждёт своего места.
function takeSlot(signal?: AbortSignal) {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const grant = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      const i = waiting.indexOf(grant);
      if (i >= 0) waiting.splice(i, 1);
      reject(new UploadError(UPLOAD_CANCELLED));
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    waiting.push(grant);
  });
}
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/**
 * session — загрузка частями: сюда записывается id сессии на сервере, а переданный id
 * продолжает уже начатую (после паузы или перезапуска приложения) с принятого места.
 */
export type UploadSessionRef = { id?: string };
type Options = { onProgress?: (fraction: number) => void; signal?: AbortSignal; session?: UploadSessionRef };

/** С какого размера файл идёт частями: обрыв посреди большого видео не начинает его заново. */
export const CHUNKED_FROM = 5 * 1024 * 1024;
/** Сколько подряд неудачных попыток части терпим (паузы растут до 30 с), прежде чем сдаться. */
const CHUNK_RETRIES = 12;

// Фото, которое увидят другие (в чате, на аватарке, в истории), — без EXIF: геопозиция,
// модель телефона. Файл «без сжатия» (kind=file) уходит байт в байт, как в Telegram.
const PHOTO_KINDS = new Set<UploadKind>(["image", "avatar", "gift"]);

export async function uploadFile(original: File, kind: UploadKind, { onProgress, signal, session }: Options = {}): Promise<Uploaded> {
  await takeSlot(signal);
  try {
    // Внутри слота: не больше трёх файлов в памяти разом, отменённый не читаем.
    if (signal?.aborted) throw new UploadError(UPLOAD_CANCELLED);
    const file = PHOTO_KINDS.has(kind) ? await withoutPhotoMetadata(original) : original;
    if (file.size >= CHUNKED_FROM || session?.id) return await sendChunked(file, kind, session ?? {}, onProgress, signal);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new UploadError(UPLOAD_CANCELLED);
      try {
        return await sendOnce(file, kind, onProgress, signal);
      } catch (err) {
        if (signal?.aborted || !(err instanceof UploadError) || !err.retryable || attempt >= RETRY_DELAYS_MS.length) throw err;
        onProgress?.(0);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  } finally {
    releaseSlot();
  }
}

/** Отменить загрузку частями на сервере (место во временных файлах освобождается сразу). */
export function cancelUploadSession(id: string) {
  void fetch(`/api/uploads/sessions/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" }).catch(() => {});
}

function failure(status: number, body: { error?: string }) {
  if (body.error) return new UploadError(body.error, status >= 500);
  if (status === 413) return new UploadError("Файл слишком большой для сервера");
  if (status === 429) return new UploadError("Слишком много загрузок подряд — подождите минуту");
  if (status === 401) return new UploadError("Сессия истекла — войдите заново");
  if (status === 502 || status === 503 || status === 504) return new UploadError("Сервер временно недоступен — попробуйте ещё раз", true);
  return new UploadError(`Не удалось загрузить файл (ошибка ${status})`, status >= 500);
}

type XhrReply = { status: number; body: Record<string, unknown> };

/**
 * Один запрос через XHR (ради прогресса отправки). Ни байта за STALL_MS — соединение мертво:
 * обрываем, это повторяемая ошибка. Сетевой сбой — тоже повторяемая, отмена — UPLOAD_CANCELLED.
 */
function xhrSend(method: string, url: string, body: Blob | null, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  return new Promise<XhrReply>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, STALL_MS);
    };
    xhr.addEventListener("loadend", () => clearTimeout(timer));
    // Байты отправлены — дальше сервер дописывает файл (большой в S3 — долго): не торопим.
    xhr.upload.addEventListener("load", () => clearTimeout(timer));
    xhr.open(method, url);
    if (body) xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.addEventListener("progress", (e) => {
      watch();
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    });
    xhr.addEventListener("load", () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
      } catch {
        // не JSON — разберёмся по статусу
      }
      resolve({ status: xhr.status, body: parsed });
    });
    xhr.addEventListener("error", () => reject(new UploadError("Не удалось загрузить файл — проверьте соединение", true)));
    xhr.addEventListener("abort", () =>
      reject(stalled ? new UploadError("Соединение оборвалось — пробуем ещё раз", true) : new UploadError(UPLOAD_CANCELLED))
    );
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
    watch();
  });
}

const asUploaded = (kind: UploadKind, body: Record<string, unknown>): Uploaded | null =>
  typeof body.url === "string"
    ? { kind, url: body.url, name: body.name as string | undefined, size: body.size as number | undefined, mimeType: body.mimeType as string | undefined }
    : null;

async function sendOnce(file: File, kind: UploadKind, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const params = new URLSearchParams({ kind, name: file.name || "file", mimeType: file.type || "" });
  const reply = await xhrSend("POST", `/api/uploads?${params}`, file, (loaded, total) => onProgress?.(loaded / total), signal);
  const uploaded = reply.status >= 200 && reply.status < 300 ? asUploaded(kind, reply.body) : null;
  if (!uploaded) throw failure(reply.status, reply.body as { error?: string });
  return uploaded;
}

/** Пауза перед повтором части: растёт до 30 с; появилась сеть — сразу. Отмена — сразу. */
function backoff(attempt: number, signal?: AbortSignal) {
  const delay = Math.min(1000 * 2 ** attempt, 30_000);
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      reject(new UploadError(UPLOAD_CANCELLED));
    };
    const timer = setTimeout(done, delay);
    window.addEventListener("online", done);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

const sessionPath = (id: string) => `/api/uploads/sessions/${encodeURIComponent(id)}`;

/**
 * Загрузка частями (/api/uploads/sessions): каждая часть — свой запрос; обрыв повторяет
 * только эту часть, а сервер на расхождение (409) говорит, сколько у него уже есть.
 * Сессия пропала (перезапуск сервера, сутки без частей — 404) — файл начинается заново.
 */
async function sendChunked(file: File, kind: UploadKind, session: UploadSessionRef, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<Uploaded> {
  const size = file.size;
  let offset = 0;
  let chunk = 4 * 1024 * 1024;
  const open = async () => {
    const params = new URLSearchParams({ kind, name: file.name || "file", mimeType: file.type || "", size: String(size) });
    const reply = await xhrSend("POST", `/api/uploads/sessions?${params}`, null, undefined, signal);
    if (reply.status !== 200 || typeof reply.body.id !== "string") throw failure(reply.status, reply.body as { error?: string });
    session.id = reply.body.id;
    chunk = Number(reply.body.chunkSize) || chunk;
    offset = 0;
  };
  if (session.id) {
    const reply = await xhrSend("GET", sessionPath(session.id), null, undefined, signal).catch(() => null);
    if (reply?.status === 200 && Number(reply.body.size) === size) {
      offset = Number(reply.body.received) || 0;
      chunk = Number(reply.body.chunkSize) || chunk;
    } else {
      session.id = undefined;
    }
  }
  if (!session.id) await open();
  onProgress?.(offset / size);

  for (let failures = 0; ; ) {
    if (signal?.aborted) throw new UploadError(UPLOAD_CANCELLED);
    try {
      if (offset >= size) {
        const reply = await xhrSend("POST", `${sessionPath(session.id!)}/complete`, null, undefined, signal);
        const uploaded = reply.status === 200 ? asUploaded(kind, reply.body) : null;
        if (uploaded) {
          session.id = undefined;
          return uploaded;
        }
        if (reply.status === 409 && typeof reply.body.received === "number") offset = reply.body.received;
        else if (reply.status === 404) await open();
        else throw failure(reply.status, reply.body as { error?: string });
        continue;
      }
      const end = Math.min(offset + chunk, size);
      const from = offset;
      const reply = await xhrSend("PUT", `${sessionPath(session.id!)}?offset=${from}`, file.slice(from, end), (loaded) => onProgress?.((from + loaded) / size), signal);
      if (reply.status === 200) {
        offset = Number(reply.body.received);
        failures = 0;
      } else if (reply.status === 409 && typeof reply.body.received === "number") {
        offset = reply.body.received;
      } else if (reply.status === 404) {
        await open();
      } else {
        throw failure(reply.status, reply.body as { error?: string });
      }
      onProgress?.(offset / size);
    } catch (err) {
      if (signal?.aborted || !(err instanceof UploadError) || !err.retryable || ++failures > CHUNK_RETRIES) throw err;
      await backoff(failures - 1, signal);
    }
  }
}
