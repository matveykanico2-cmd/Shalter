import { checkSize } from "./uploadLimits.js";

// Streams a picked file to POST /api/uploads and returns the attachment object
// to put on a message.
//
// XMLHttpRequest, not fetch: upload progress is the whole point here (a 2GB video
// over a home connection is minutes of silence otherwise) and fetch still has no
// way to report it — `duplex: "half"` request streams aren't supported for
// upload progress in browsers. The file object is handed to xhr.send() directly,
// so the browser streams it from disk; nothing reads it into memory the way the
// old FileReader/base64 path did.
// onXhrReady, when given, is handed the live XMLHttpRequest the moment it's
// created — the only way a caller can cancel an in-flight upload (e.g. a
// user removing one thumbnail from a multi-file batch before it finishes).
//
// Не больше трёх загрузок одновременно. Десять файлов разом делили канал на
// десять: каждый полз, все заканчивались в самом конце, а сервер держал в
// памяти десять потоков сразу. По очереди первые файлы готовы раньше, и
// повтор при сбое не стоит начинать с нуля всей пачкой.
//
// Временный сбой (связь моргнула, сервер перезапускался — это 502/503/504)
// повторяется сам, до трёх попыток с паузой. Повтор безопасен: сервер хранит
// одинаковое содержимое один раз (routes/uploads.js, дедупликация).
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
  // Отмена, пока файл ещё ждёт своей очереди: настоящего запроса нет, а
  // отменять уже можно.
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

// Почему не загрузилось — словами, а не одним «Не удалось загрузить файл» на
// всё. Ответ с ошибкой приходит не только от приложения: при 413 или 502 его
// пишет прокси перед сервером, и там не JSON, а HTML-страница.
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
        /* fall through to the status check below */
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
