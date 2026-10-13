// «Загрузки» Shalter: что человек скачивал из чатов (файлы, фото, видео, музыка).
// Список хранится у него в браузере; сами файлы открываются встроенным
// просмотрщиком (components/downloadsDialog.js) по тем же ссылкам /uploads/….
const KEY = "shalter.downloads";
const MAX = 300;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

export function kindOf(name = "", mime = "") {
  const n = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|bmp|heic)$/.test(n)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/.test(n)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/.test(n)) return "audio";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(txt|md|csv|json|log|xml|ya?ml|js|ts|py|html?|css|ini|srt)$/.test(n)) return "text";
  return "file";
}

export function recordDownload({ url, name, size, mime }) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return;
  const list = read().filter((d) => d.url !== url);
  list.unshift({ url, name: name || url.split("/").pop(), size: size || 0, kind: kindOf(name, mime), at: Date.now(), chatPath: location.pathname });
  write(list);
  window.dispatchEvent(new CustomEvent("shalter:downloads-changed"));
}

export function listDownloads() {
  return read();
}

export function removeDownload(url) {
  write(read().filter((d) => d.url !== url));
  window.dispatchEvent(new CustomEvent("shalter:downloads-changed"));
}

export function clearDownloads() {
  write([]);
  window.dispatchEvent(new CustomEvent("shalter:downloads-changed"));
}

// Любая ссылка «Скачать» в приложении (файл в чате, просмотрщик, музыка) —
// запоминаем в «Загрузках». Ловим на всплытии в фазе захвата, ничего не ломая.
let started = false;
export function startDownloadTracking() {
  if (started) return;
  started = true;
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a[download]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/uploads/") && !href.startsWith(location.origin + "/uploads/")) return;
      const size = Number(a.closest(".file-attachment")?.querySelector(".file-attachment-size")?.dataset.bytes) || 0;
      recordDownload({ url: href.replace(location.origin, ""), name: a.getAttribute("download") || "", size });
    },
    true
  );
}
