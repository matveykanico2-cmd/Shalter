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

  // Масштаб и сдвиг картинки в просмотрщике — свой зум, потому что зум всей
  // страницы отключён (index.html, user-scalable=no), и без этого фото нельзя
  // было бы приблизить вовсе. Сбрасывается на каждом новом кадре. Объявлены ДО
  // show(): show() их присваивает, а let до своей строки — в «мёртвой зоне»
  // (TDZ), и прежний вызов show() выше бросал ReferenceError — просмотрщик
  // открывался пустым, прозрачно-чёрным.
  let scale = 1;
  let tx = 0;
  let ty = 0;

  const overlay = el("div", { class: "media-viewer-overlay", onclick: (e) => e.target === overlay && close() });
  const head = el("div", { class: "media-viewer-head" });
  const stage = el("div", { class: "media-viewer-stage" });
  const prevBtn = el("button", { class: "media-viewer-nav prev", title: "Предыдущее", html: iconSvg("ChevronLeft", 26), onclick: () => go(-1) });
  const nextBtn = el("button", { class: "media-viewer-nav next", title: "Следующее", html: iconSvg("ChevronRight", 26), onclick: () => go(1) });

  appendAll(overlay, el("div", { class: "media-viewer" }, [head, stage]), items.length > 1 ? prevBtn : null, items.length > 1 ? nextBtn : null);
  document.body.appendChild(overlay);
  show();

  function applyTransform() {
    if (!media) return;
    media.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    media.style.cursor = scale > 1 ? "grab" : "";
    media.classList.toggle("zoomed", scale > 1);
  }
  function resetZoom() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }
  function zoomTo(next, cx = 0, cy = 0) {
    const clamped = Math.max(1, Math.min(5, next));
    if (clamped === scale) return;
    // Зумируем к точке под курсором/пальцем, а не к центру: иначе при
    // приближении деталь уезжает из-под пальца.
    const rect = media.getBoundingClientRect();
    const ox = cx - (rect.left + rect.width / 2);
    const oy = cy - (rect.top + rect.height / 2);
    const k = clamped / scale;
    tx = tx - ox * (k - 1);
    ty = ty - oy * (k - 1);
    scale = clamped;
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    applyTransform();
  }

  function show() {
    if (media?.tagName === "VIDEO") media.pause();
    const item = items[at];
    media =
      item.kind === "video"
        ? el("video", { class: "media-viewer-media", src: item.url, controls: true, autoplay: true, playsInline: true })
        : el("img", { class: "media-viewer-media", src: item.url, alt: item.name || "" });
    // Полная картинка не загрузилась (её убрали как доставленную) — показываем
    // эскиз, который точно есть, вместо «прозрачно-чёрного» экрана. Один раз,
    // чтобы не зациклиться, если и эскиз недоступен.
    if (item.kind !== "video" && item.thumbUrl && item.thumbUrl !== item.url) {
      media.addEventListener(
        "error",
        () => {
          if (media.src !== item.thumbUrl) media.src = item.thumbUrl;
        },
        { once: true }
      );
    }
    scale = 1;
    tx = 0;
    ty = 0;
    clear(stage);
    stage.appendChild(media);
    applyTransform();
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

  // Колесо мыши / тачпад — зум к точке под курсором (только для фото: у видео
  // свои элементы управления). Ctrl+колесо тоже, но и обычное колесо, раз зум
  // страницы отключён и прокручивать тут нечего.
  stage.addEventListener(
    "wheel",
    (e) => {
      if (items[at]?.kind === "video") return;
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    },
    { passive: false }
  );
  // Двойной клик/тап — быстрый зум 1× ↔ 2.5×.
  stage.addEventListener("dblclick", (e) => {
    if (items[at]?.kind === "video") return;
    if (scale > 1) resetZoom();
    else zoomTo(2.5, e.clientX, e.clientY);
  });

  // Указатели: один — свайп между кадрами (когда не приближено) или
  // перетаскивание (когда приближено); два — пинч-зум.
  const pointers = new Map();
  let swipeStartX = null;
  let panStart = null; // { x, y, tx, ty }
  let pinchStart = null; // { dist, scale, cx, cy }

  stage.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      swipeStartX = null;
      panStart = null;
    } else if (scale > 1) {
      panStart = { x: e.clientX, y: e.clientY, tx, ty };
      try { media.setPointerCapture?.(e.pointerId); } catch {}
    } else if (e.pointerType !== "mouse") {
      swipeStartX = e.clientX;
    }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinchStart.scale * (dist / pinchStart.dist), pinchStart.cx, pinchStart.cy);
    } else if (panStart) {
      tx = panStart.tx + (e.clientX - panStart.x);
      ty = panStart.ty + (e.clientY - panStart.y);
      applyTransform();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (panStart) {
      panStart = null;
      return;
    }
    if (swipeStartX !== null) {
      const dx = e.clientX - swipeStartX;
      swipeStartX = null;
      if (scale === 1 && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    pinchStart = null;
    panStart = null;
    swipeStartX = null;
  });

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
      thumbUrl: b.dataset.mediaThumb || null,
    })),
    index,
  };
}
