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
export function uploadFile(file, kind, onProgress) {
  const sizeError = checkSize(file, kind);
  if (sizeError) return Promise.reject(new Error(sizeError));

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
        reject(new Error(body.error || "Не удалось загрузить файл"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Не удалось загрузить файл — проверьте соединение")));
    xhr.addEventListener("abort", () => reject(new Error("Загрузка отменена")));

    xhr.send(file);
  });
}
