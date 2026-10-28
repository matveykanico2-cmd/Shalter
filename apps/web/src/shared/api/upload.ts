// Загрузка файла (POST /api/uploads) — как public/js/lib/upload.js: XHR ради прогресса,
// не больше трёх одновременно, повтор после сбоя сети или 5xx (через 1 и 3 с).
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

type Options = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

export async function uploadFile(file: File, kind: UploadKind, { onProgress, signal }: Options = {}): Promise<Uploaded> {
  await takeSlot(signal);
  try {
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

function failure(status: number, body: { error?: string }) {
  if (body.error) return new UploadError(body.error, status >= 500);
  if (status === 413) return new UploadError("Файл слишком большой для сервера");
  if (status === 429) return new UploadError("Слишком много загрузок подряд — подождите минуту");
  if (status === 401) return new UploadError("Сессия истекла — войдите заново");
  if (status === 502 || status === 503 || status === 504) return new UploadError("Сервер временно недоступен — попробуйте ещё раз", true);
  return new UploadError(`Не удалось загрузить файл (ошибка ${status})`, status >= 500);
}

function sendOnce(file: File, kind: UploadKind, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const params = new URLSearchParams({ kind, name: file.name || "file", mimeType: file.type || "" });
  return new Promise<Uploaded>((resolve, reject) => {
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
    xhr.open("POST", `/api/uploads?${params}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.addEventListener("progress", (e) => {
      watch();
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      let body: { url?: string; name?: string; size?: number; mimeType?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        // не JSON — разберёмся по статусу
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve({ kind, url: body.url, name: body.name, size: body.size, mimeType: body.mimeType });
      else reject(failure(xhr.status, body));
    });
    xhr.addEventListener("error", () => reject(new UploadError("Не удалось загрузить файл — проверьте соединение", true)));
    xhr.addEventListener("abort", () =>
      reject(stalled ? new UploadError("Соединение оборвалось — пробуем ещё раз", true) : new UploadError(UPLOAD_CANCELLED))
    );
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
    watch();
  });
}
