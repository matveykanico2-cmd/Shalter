// Downscales an uploaded photo client-side before it's stored inline as a
// data URL (no object storage in this app) — keeps the JSON store from bloating.
export function fileToImageDataUrl(file, maxSize = 256, mime = "image/jpeg", quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas недоступен"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const fileToAvatarDataUrl = (file) => fileToImageDataUrl(file, 256);

// То же уменьшение, но результат — файл, а не строка: его можно отдать
// потоковой загрузке (lib/upload.js), вместо того чтобы тащить картинку внутри
// JSON. Нужно там, где кадров может быть много (истории): десяток снимков в
// base64 не влезает ни в предел тела запроса, ни в здравый смысл.
// Поддерживает ли браузер webp на выходе. Проверяется один раз: canvas честно
// отвечает jpeg, если формат ему не знаком, — поэтому смотрим на сам результат,
// а не на строку в userAgent.
let webpSupported = null;
function supportsWebp() {
  if (webpSupported !== null) return webpSupported;
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    webpSupported = probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

// Картинка, готовая к отправке файлом.
//
// Два решения ради места на диске — а его расходуют именно фотографии:
//
// - webp вместо jpeg там, где браузер умеет: при той же картинке файл меньше
//   примерно на четверть-треть. Откат на jpeg остаётся, чтобы ничего не
//   сломалось на старом браузере.
// - качество 0.8 вместо 0.85: на фотографии разницы не видно, а вес падает
//   заметно. Планка в 1600 пикселей по длинной стороне (её задаёт вызывающий)
//   и так избыточна для экрана телефона.
export async function fileToImageUpload(file, maxSize = 1080) {
  const webp = supportsWebp();
  // Качество 0.85 — то, при котором на глаз картинка неотличима от исходной.
  // В webp это к тому же ощутимо легче, чем тот же уровень в jpeg.
  const dataUrl = await fileToImageDataUrl(file, maxSize, webp ? "image/webp" : "image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  const ext = webp ? ".webp" : ".jpg";
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ext;
  return new File([blob], name, { type: webp ? "image/webp" : "image/jpeg" });
}

// Фото перед отправкой в чат — уменьшенное до разумного размера.
//
// Раньше фотография уходила как есть: снимок с телефона — это 4000×3000 и
// 5–10 МБ. Десять таких — полсотни мегабайт через домашний канал на отправку,
// и столько же серверу: принять, зашифровать, пережать в эскиз. Отсюда и
// «долго грузится», и падения сервера при пачке фотографий. 2560 пикселей по
// длинной стороне — больше, чем экран любого телефона и большинства
// мониторов; на глаз разницы нет, а файл меньше в десять-двадцать раз.
//
// Оригинал без пережатия по-прежнему уходит через «Файл».
//
// Если что-то пошло не так (формат, который браузер не открывает, например
// HEIC на Android) — отдаём исходный файл: отправить без сжатия лучше, чем не
// отправить вовсе.
const PHOTO_MAX_SIDE = 2560;
const PHOTO_SKIP_BYTES = 800 * 1024;
export async function compressPhotoForUpload(file) {
  const type = file.type || "";
  // Анимацию canvas превратил бы в один кадр, вектор — в растр.
  if (!type.startsWith("image/") || type === "image/gif" || type === "image/svg+xml") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (file.size <= PHOTO_SKIP_BYTES && longSide <= PHOTO_MAX_SIDE) return file;
    const scale = Math.min(1, PHOTO_MAX_SIDE / longSide);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const webp = supportsWebp();
    // У jpeg нет прозрачности — прозрачные места иначе стали бы чёрными.
    if (!webp) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const mime = webp ? "image/webp" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.85));
    // Бывает, что пережатое выходит тяжелее (маленький скриншот в png) —
    // тогда смысла нет.
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + (webp ? ".webp" : ".jpg");
    return new File([blob], name, { type: mime });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

// Картинка для своего стикера.
//
// Стикеру хватает 512 пикселей — больше, чем он когда-либо занимает на
// экране. Прозрачность сохраняется: PNG без фона остаётся без фона (webp и
// png её умеют, поэтому jpeg здесь не используется вовсе). GIF не трогаем —
// перерисовка через canvas оставила бы от анимации один кадр; только
// ограничиваем размер.
// Анимированный webp узнаётся по блоку ANIM в начале файла — его, как и GIF,
// нельзя пропускать через canvas.
async function isAnimatedWebp(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return String.fromCharCode(...head).includes("ANIM");
  } catch {
    return false;
  }
}
const STICKER_SIDE = 512;
const STICKER_GIF_MAX = 3 * 1024 * 1024;
export async function prepareStickerImage(file) {
  const type = file.type || "";
  if (type === "image/gif" || (type === "image/webp" && (await isAnimatedWebp(file)))) {
    if (file.size > STICKER_GIF_MAX) throw new Error("GIF больше 3 МБ — возьмите покороче или поменьше");
    return { file, animated: true };
  }
  if (!type.startsWith("image/")) throw new Error("Это не картинка");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Не удалось открыть картинку");
  }
  try {
    const scale = Math.min(1, STICKER_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    // Холст изначально прозрачный — ничего под картинку не подкладываем.
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const mime = supportsWebp() ? "image/webp" : "image/png";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9));
    if (!blob) throw new Error("Не удалось подготовить картинку");
    const name = (file.name || "sticker").replace(/\.[^.]+$/, "") + (mime === "image/webp" ? ".webp" : ".png");
    return { file: new File([blob], name, { type: mime }), animated: false };
  } finally {
    bitmap.close?.();
  }
}

// One frame out of a video file, downscaled, as a data URL.
//
// A video avatar still needs a still: every avatar circle in the app — chat
// list rows, message senders, push notifications — shows an <img>, and fifty
// autoplaying <video> elements in a scrolling list is not a trade worth making
// for a moving thumbnail. So the video plays in the viewer, and this frame
// stands in everywhere else.
//
// Seeks a little past the start rather than using frame 0: the first frame of a
// phone recording is very often black or half-exposed.
export function videoPosterDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const fail = (msg) => {
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    video.onerror = () => fail("Не удалось прочитать видео");
    video.onloadeddata = () => {
      // Some browsers fire loadeddata before a seek completes, so the draw
      // happens in onseeked below; seeking to 0 wouldn't fire it at all.
      video.currentTime = Math.min(0.25, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      try {
        const w0 = video.videoWidth;
        const h0 = video.videoHeight;
        if (!w0 || !h0) return fail("Видео без изображения");
        const scale = Math.min(1, maxSize / Math.max(w0, h0));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w0 * scale);
        canvas.height = Math.round(h0 * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(url);
        resolve(poster);
      } catch {
        fail("Не удалось получить кадр из видео");
      }
    };
    video.src = url;
  });
}

// Plain read-as-data-URL, no re-encoding — used for videos and generic files
// where client-side transcoding isn't practical.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
