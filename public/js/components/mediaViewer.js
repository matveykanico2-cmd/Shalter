import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Полноэкранный просмотр фото и видео из переписки — и единственное место,
// где запрашивается вложение в полном качестве: до открытия в чате видна
// только миниатюра (attachments.js), а этот файл сервер отдаёт лишь тому,
// кто действительно нажал «посмотреть». Раньше полное изображение начинало
// качаться само, стоило сообщению появиться на экране, — и так для каждой
// фотографии в истории чата, даже если её никто не открывал.
// originalUrl — полный файл, когда `url` это лёгкое превью (240p-видео с
// сервера): играем превью, а оригинал отдаём отдельной кнопкой, чтобы он
// качался только по просьбе.
//
// gallery/index — все фото и видео открытой переписки по порядку (их собирает
// attachments.js): стрелками, клавишами ←/→ или смахиванием листаются соседние,
// как в Telegram, а не «закрыть — найти следующее — открыть».
export function openMediaViewer({ kind, url, name, originalUrl = null, gallery = null, index = 0 }) {
  const items = gallery?.length ? gallery : [{ kind, url, name, originalUrl }];
  let at = Math.min(Math.max(index, 0), items.length - 1);
  let media = null;

  const overlay = el("div", { class: "media-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const head = el("div", { class: "media-viewer-head" });
  const stage = el("div", { class: "media-viewer-stage" });
  const prevBtn = el("button", { class: "media-viewer-nav prev", title: "Предыдущее", html: iconSvg("ChevronLeft", 26), onclick: () => go(-1) });
  const nextBtn = el("button", { class: "media-viewer-nav next", title: "Следующее", html: iconSvg("ChevronRight", 26), onclick: () => go(1) });

  appendAll(overlay, el("div", { class: "media-viewer" }, [head, stage]), items.length > 1 ? prevBtn : null, items.length > 1 ? nextBtn : null);
  document.body.appendChild(overlay);
  show();

  function show() {
    if (media?.tagName === "VIDEO") media.pause();
    const item = items[at];
    media =
      item.kind === "video"
        ? el("video", { class: "media-viewer-media", src: item.url, controls: true, autoplay: true, playsInline: true })
        : el("img", { class: "media-viewer-media", src: item.url, alt: item.name || "" });
    clear(stage);
    stage.appendChild(media);
    clear(head);
    appendAll(
      head,
      items.length > 1 ? el("span", { class: "mono media-viewer-counter" }, `${at + 1} из ${items.length}`) : null,
      el("span", { class: "media-viewer-spacer" }),
      // download, а не переход по ссылке: файл сохраняется рядом, вкладка
      // с чатом никуда не девается.
      item.originalUrl
        ? el("a", { class: "media-viewer-original", title: "Скачать оригинал", href: item.originalUrl, download: item.name || "file" }, [
            el("span", { html: iconSvg("Download", 18) }),
            el("span", {}, "Скачать оригинал"),
          ])
        : el("a", { class: "icon-btn", title: "Скачать", href: item.url, download: item.name || "file", html: iconSvg("Download", 20) }),
      el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() })
    );
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === items.length - 1;
  }

  function go(delta) {
    const next = at + delta;
    if (next < 0 || next >= items.length) return;
    at = next;
    show();
  }

  // Смахивание на телефоне: влево — следующее, вправо — предыдущее.
  let swipeStartX = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") swipeStartX = e.clientX;
  });
  stage.addEventListener("pointerup", (e) => {
    if (swipeStartX === null) return;
    const dx = e.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  });
  stage.addEventListener("pointercancel", () => (swipeStartX = null));

  function close() {
    document.removeEventListener("keydown", onKey, true);
    if (media?.tagName === "VIDEO") media.pause();
    overlay.remove();
  }
  // На погружении и с остановкой: иначе тот же Esc доходил до общего
  // обработчика (lib/keyboardShortcuts.js) и вместе с просмотрщиком закрывал
  // весь чат, а стрелки — листали список чатов.
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && items.length > 1 && !e.altKey) {
      e.stopPropagation();
      e.preventDefault();
      go(e.key === "ArrowLeft" ? -1 : 1);
    }
  }
  document.addEventListener("keydown", onKey, true);

  return close;
}

// Все фото и видео той же переписки, что и нажатое, — по порядку ленты. Ищем
// по разметке, а не по данным: кнопки вложений помечены (attachments.js), а
// лента на экране — это ровно то, что человек и листает. Вне ленты (медиа в
// профиле и т. п.) — просто одно открытое фото, как раньше.
export function galleryAround(button) {
  const scope = button?.closest?.(".message-list");
  if (!scope) return {};
  const buttons = [...scope.querySelectorAll("[data-media-url]")];
  const index = buttons.indexOf(button);
  if (index < 0) return {};
  return {
    gallery: buttons.map((b) => ({
      kind: b.dataset.mediaKind,
      url: b.dataset.mediaUrl,
      name: b.dataset.mediaName || "",
      originalUrl: b.dataset.mediaOriginal || null,
    })),
    index,
  };
}
