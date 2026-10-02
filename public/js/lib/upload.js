import { checkSize } from "./uploadLimits.js";

const MAX_PARALLEL = 3;
const RETRY_DELAYS_MS = [1000, 3000];
let running = 0;
const waiting = [];

function takeSlot() {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

export async function uploadFile(file, kind, onProgress, onXhrReady) {
  const sizeError = checkSize(file, kind);
  if (sizeError) throw new Error(sizeError);

  let cancelled = false;
  onXhrReady?.({ abort: () => (cancelled = true) });
  await takeSlot();
  try {
    for (let attempt = 0; ; attempt++) {
      if (cancelled) throw new Error("Загрузка отменена");
      try {
        return await sendOnce(file, kind, onProgress, (xhr) => {
          onXhrReady?.({
            abort: () => {
              cancelled = true;
              xhr.abort();
            },
          });
        });
      } catch (err) {
        if (cancelled || !err.retryable || attempt >= RETRY_DELAYS_MS.length) throw err;
        onProgress?.(0);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  } finally {
    releaseSlot();
  }
}

function failure(status, body) {
  if (body.error) return Object.assign(new Error(body.error), { retryable: status >= 500 });
  if (status === 413) return new Error("Файл слишком большой для сервера");
  if (status === 429) return new Error("Слишком много загрузок подряд — подождите минуту");
  if (status === 401) return new Error("Сессия истекла — войдите заново");
  if (status === 502 || status === 503 || status === 504) {
    return Object.assign(new Error("Сервер временно недоступен — попробуйте ещё раз"), { retryable: true });
  }
  return Object.assign(new Error(`Не удалось загрузить файл (ошибка ${status})`), { retryable: status >= 500 });
}

function sendOnce(file, kind, onProgress, onXhrReady) {
  const params = new URLSearchParams({ kind, name: file.name || "file", mimeType: file.type || "" });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads?${params.toString()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) {
        resolve({ kind, url: body.url, name: body.name, size: body.size, mimeType: body.mimeType });
      } else {
        reject(failure(xhr.status, body));
      }
    });
    xhr.addEventListener("error", () =>
      reject(Object.assign(new Error("Не удалось загрузить файл — проверьте соединение"), { retryable: true }))
    );
    xhr.addEventListener("abort", () => reject(new Error("Загрузка отменена")));

    onXhrReady?.(xhr);
    xhr.send(file);
  });
}
