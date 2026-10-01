import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { openInAppBrowser } from "./inAppBrowser.js";
import { openMediaViewer, galleryAround } from "./mediaViewer.js";

// Attachment/link-preview renderers shared between the chat's MessageBubble
// and the profile dialog's Media/Files/Links tabs — kept in their own module
// (rather than exported from messageBubble.js) so the profile dialog doesn't
// have to import from a file that itself imports openProfileDialog, which
// would make the two modules circularly dependent on each other.
// Сервер ещё готовит лёгкую копию (server/lib/mediaPreview.js): открывать пока
// нечего — оригинал на несколько гигабайт для этого и не годится.
// Кнопка, открывающая фото или видео. Помечена данными вложения, чтобы
// просмотрщик мог собрать из ленты соседние и листать их (mediaViewer.js's
// galleryAround).
function MediaButton(className, item, children) {
  return el(
    "button",
    {
      class: className,
      type: "button",
      "data-media-kind": item.kind,
      "data-media-url": item.url,
      "data-media-name": item.name || "",
      "data-media-original": item.originalUrl || "",
      // Миниатюра — запасной кадр для просмотрщика: полная версия картинки могла
      // быть удалена сервером как доставленная (server/lib/orphanSweep.js), и
      // тогда по a.url приходит пусто — был «прозрачно-чёрный» экран. По эскизу
      // (он точно есть, его и видно в ленте) просмотрщик покажет хоть что-то.
      "data-media-thumb": item.thumbUrl || "",
      onclick: (e) => openMediaViewer({ ...item, ...galleryAround(e.currentTarget) }),
    },
    children
  );
}

function PendingPreview(poster) {
  return el("div", { class: "attachment-pending" }, [
    poster ? el("img", { src: poster, alt: "", class: "video-attachment-poster" }) : el("div", { class: "video-attachment-poster" }),
    el("span", { class: "attachment-pending-spinner" }),
  ]);
}

export function ImageAttachment(a) {
  // В чате видна только миниатюра — килобайты, рисуется мгновенно, переписка
  // листается без серых дыр на месте фотографий. Полное качество не
  // подгружается само: оно запрашивается только при открытии просмотрщика
  // (mediaViewer.js) по нажатию. Раньше полная картинка начинала качаться
  // молча, стоило сообщению появиться на экране, — для каждой фотографии в
  // истории чата, даже нераскрытой, и это и был расход трафика и места на
  // устройстве, о котором просили не делать.
  //
  // Если полной уже нет на сервере (её убрали как доставленную, см.
  // server/lib/orphanSweep.js), просмотрщик покажет то, что успеет
  // загрузиться, — а до открытия чат всё равно выглядит целым по эскизу.
  // Пока сервер считает эскиз, показывать вместо него оригинал нельзя: это
  // ровно тот полноразмерный файл, ради которого эскиз и делается.
  // Эскиз ещё считается на сервере (previewPending, thumbUrl пуст). Раньше здесь
  // висел тёмный плейсхолдер до перезагрузки страницы — теперь показываем сам
  // только что загруженный файл (он уже в кэше устройства), чтобы картинка
  // появлялась сразу; когда подъедет эскиз, он и заменит src.
  const img = el("img", { src: a.thumbUrl || a.url, alt: a.name || "photo", class: "image-attachment", loading: "lazy" });
  return MediaButton("image-attachment-btn", { kind: "image", url: a.url, name: a.name, thumbUrl: a.thumbUrl || a.url }, [img]);
}

export function VideoAttachment(a) {
  // Тот же принцип, что и у фото: ничего не качается, пока не нажали. Постер и
  // лёгкое 240p-превью готовит сервер после загрузки (server/lib/mediaPreview.js),
  // поэтому сразу после отправки у вложения стоит previewPending — до прихода
  // message:updated на месте кадра крутится ожидание, а не кнопка, открывающая
  // оригинал на несколько гигабайт.
  const poster = a.posterUrl || a.thumbUrl;
  // Постер ещё готовится и его пока нет: раньше висел тёмный плейсхолдер до
  // перезагрузки. Показываем первый кадр самого файла — preload=metadata тянет
  // только метаданные (и кадр-постер), а не весь ролик.
  if (a.previewPending && !poster) {
    return MediaButton("video-attachment-btn", { kind: "video", url: a.url, name: a.name }, [
      el("video", { class: "video-attachment-poster", src: a.url, preload: "metadata", muted: true, playsinline: true }),
      el("span", { class: "video-attachment-play", html: iconSvg("Video", 28) }),
    ]);
  }
  if (a.previewPending) return PendingPreview(poster);
  // Играет превью, а оригинал просмотрщик предлагает отдельной кнопкой
  // «Скачать оригинал» — смотреть пятигигабайтный файл потоком незачем.
  return MediaButton("video-attachment-btn", { kind: "video", url: a.previewUrl || a.url, name: a.name, originalUrl: a.previewUrl ? a.url : null }, [
    poster ? el("img", { src: poster, alt: "", class: "video-attachment-poster" }) : el("div", { class: "video-attachment-poster" }),
    el("span", { class: "video-attachment-play", html: iconSvg("Video", 28) }),
  ]);
}

// «10 Б», «512 КБ», «3,4 МБ», «1,2 ГБ» — раньше размер всегда писался в
// килобайтах и маленький файл выглядел пустым («0 КБ»), а большой — числом
// из семи цифр.
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

export function FileAttachment(a) {
  return el("a", { href: a.url, download: a.name || "file", class: "file-attachment" }, [
    el("span", { html: iconSvg("Download", 18) }),
    el("div", { class: "file-attachment-info" }, [
      el("p", { class: "file-attachment-name" }, a.name || "Файл"),
      el("p", { class: "mono file-attachment-size" }, a.size ? formatSize(a.size) : ""),
    ]),
  ]);
}

// Rendered from message.linkPreview (server/lib/linkPreview.js, fetched
// server-side after send — see routes/messages.js). Opens via the in-app
// browser rather than a new tab, same as inline links in formatText.js.
export function LinkPreviewCard(p) {
  if (!p.title && !p.description && !p.image && !p.warning) return null;
  return el(
    "button",
    { class: "link-preview-card", onclick: () => openInAppBrowser(p.url, { unsafe: p.unsafe, warning: p.warning }) },
    [
      p.image ? el("img", { class: "link-preview-image", src: p.image, alt: "" }) : null,
      el("div", { class: "link-preview-body" }, [
        p.warning ? el("p", { class: `link-preview-warning ${p.unsafe ? "danger" : ""}` }, [el("span", { html: iconSvg("Info", 12) }), " ", p.warning]) : null,
        p.siteName ? el("p", { class: "link-preview-site" }, p.siteName) : null,
        p.title ? el("p", { class: "link-preview-title" }, p.title) : null,
        p.description ? el("p", { class: "link-preview-desc" }, p.description) : null,
      ]),
    ]
  );
}

export function LocationAttachment(a) {
  const { lat, lng, live, expiresAt } = a.meta ?? {};
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  // "Обновляется" только пока не истёк expiresAt — сервер сам перестаёт
  // принимать обновления после этого (data/messages.js's updateLiveLocation),
  // так что после истечения это просто последняя известная точка, тот же
  // вид, что и у обычной (не живой) геолокации.
  const isLive = live && expiresAt && expiresAt > new Date().toISOString();
  const label = isLive
    ? `Живая геолокация — обновляется до ${new Date(expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
    : live
      ? "Геолокация (трансляция окончена)"
      : "Геолокация";
  return el("a", { href: mapUrl, target: "_blank", rel: "noreferrer", class: `location-attachment ${isLive ? "live" : ""}` }, [
    el("span", { html: iconSvg("MapPin", 18) }),
    el("div", {}, [
      el("p", {}, label),
      el("p", { class: "mono location-coords" }, `${lat?.toFixed(5)}, ${lng?.toFixed(5)}`),
    ]),
  ]);
}
