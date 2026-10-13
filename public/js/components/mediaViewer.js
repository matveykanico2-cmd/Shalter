import { textWithEmoji } from "../lib/emojiImages.js";
import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { pushOverlay } from "../router.js";

export function openMediaViewer({ kind, url, name, originalUrl = null, gallery = null, index = 0 }) {
  const items = gallery?.length ? gallery : [{ kind, url, name, originalUrl }];
  let at = Math.min(Math.max(index, 0), items.length - 1);
  let media = null;

  let scale = 1;
  let gestureAt = 0;
  let tx = 0;
  let ty = 0;

  const overlay = el("div", {
    class: "media-viewer-overlay",
    onclick: (e) => {
      if (e.target === overlay) close();
      // тап по пустому месту сцены закрывает, как в Telegram
      else if ((e.target === stage || e.target === failBox || (!failBox.hidden && e.target === media)) && scale === 1 && Date.now() - gestureAt > 350) close();
    },
  });
  const head = el("div", { class: "media-viewer-head" });
  const stage = el("div", { class: "media-viewer-stage" });
  const prevBtn = el("button", { class: "media-viewer-nav prev", title: "Предыдущее", html: iconSvg("ChevronLeft", 26), onclick: () => go(-1) });
  const nextBtn = el("button", { class: "media-viewer-nav next", title: "Следующее", html: iconSvg("ChevronRight", 26), onclick: () => go(1) });

  const captionEl = el("div", { class: "media-viewer-caption", hidden: true });
  // Крестик поверх всего: шапка на телефоне может уйти под статус-бар, а из
  // незагрузившейся картинки выйти нужно всегда.
  const closeFab = el("button", { class: "media-viewer-close-fab", title: "Закрыть", "aria-label": "Закрыть", html: iconSvg("X", 22), onclick: (e) => (e.stopPropagation(), close()) });
  appendAll(overlay, el("div", { class: "media-viewer" }, [head, stage, captionEl]), items.length > 1 ? prevBtn : null, items.length > 1 ? nextBtn : null, closeFab);
  document.body.appendChild(overlay);
  // «Назад» на телефоне закрывает просмотр (и без сети тоже).
  const dropHistory = pushOverlay(() => close(true));

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

  // Состояние загрузки текущего медиа: спиннер, пока грузится, и плашка
  // «Повторить», если не загрузилось (вместо чёрного экрана / битой иконки).
  const spinner = el("span", { class: "media-viewer-spinner", hidden: true });
  const failBox = el("div", { class: "media-viewer-fail", hidden: true });
  function setState(state, retry) {
    spinner.hidden = state !== "loading";
    failBox.hidden = state !== "failed";
    if (state === "failed") {
      clear(failBox);
      appendAll(
        failBox,
        el("span", { class: "media-viewer-fail-icon", html: iconSvg("RotateCw", 28) }),
        el("span", {}, navigator.onLine === false ? "Нет подключения к сети" : "Не удалось загрузить"),
        el("div", { class: "media-viewer-fail-actions" }, [
          el("button", { class: "media-viewer-fail-btn", type: "button", onclick: (e) => (e.stopPropagation(), retry?.()) }, "Повторить"),
          el("button", { class: "media-viewer-fail-btn secondary", type: "button", onclick: (e) => (e.stopPropagation(), close()) }, "Закрыть"),
        ])
      );
    }
  }
  const bust = (u) => u + (u.includes("?") ? "&" : "?") + "r=" + Date.now().toString(36);

  function buildMedia(item) {
    if (item.kind === "video") {
      const sources = [item.url, item.fallbackUrl].filter(Boolean);
      let i = 0;
      const v = el("video", {
        class: "media-viewer-media",
        src: sources[0],
        controls: true,
        autoplay: true,
        playsInline: true,
        preload: "auto",
        ...(item.thumbUrl ? { poster: item.thumbUrl } : {}),
      });
      setState("loading");
      const ready = () => setState("ready");
      v.addEventListener("loadeddata", ready);
      v.addEventListener("canplay", ready);
      v.addEventListener("playing", ready);
      v.addEventListener("waiting", () => setState("loading"));
      v.addEventListener("error", () => {
        if (++i < sources.length) {
          v.src = sources[i];
          v.play().catch(() => {});
          return;
        }
        setState("failed", () => {
          i = 0;
          setState("loading");
          v.src = bust(sources[0]);
          v.play().catch(() => {});
        });
      });
      return v;
    }
    // Фото: сразу показываем уже загруженную миниатюру из ленты, а оригинал
    // подменяем, когда догрузится — экран не пустой даже на медленной сети.
    const img = el("img", { class: "media-viewer-media", alt: item.name || "", decoding: "async" });
    const full = item.url;
    const thumb = item.thumbUrl && item.thumbUrl !== full ? item.thumbUrl : null;
    let shownFull = false;
    const loadFull = (url) => {
      setState("loading");
      const probe = new Image();
      probe.decoding = "async";
      probe.onload = () => {
        if (media !== img) return;
        shownFull = true;
        img.src = probe.src;
        img.classList.remove("media-viewer-blur");
        setState("ready");
      };
      probe.onerror = () => {
        if (media !== img) return;
        if (thumb && img.getAttribute("src")) {
          // оригинал не отдался, но миниатюра уже на экране — показываем её
          img.classList.remove("media-viewer-blur");
          setState("ready");
          return;
        }
        setState("failed", () => loadFull(bust(full)));
      };
      probe.src = url;
    };
    if (thumb) {
      img.src = thumb;
      img.classList.add("media-viewer-blur");
      img.addEventListener("error", () => !shownFull && img.removeAttribute("src"), { once: true });
    }
    loadFull(full);
    return img;
  }

  function show() {
    if (media?.tagName === "VIDEO") {
      media.pause();
      media.removeAttribute("src");
      media.load?.();
    }
    const item = items[at];
    media = null;
    media = buildMedia(item);
    scale = 1;
    tx = 0;
    ty = 0;
    clear(stage);
    appendAll(stage, media, spinner, failBox);
    applyTransform();
    clear(head);
    appendAll(
      head,
      item.author
        ? el("div", { class: "media-viewer-author" }, [
            item.avatarHtml ? el("span", { class: "media-viewer-author-avatar", html: item.avatarHtml }) : null,
            el("span", { class: "media-viewer-author-text" }, [
              el("span", { class: "media-viewer-author-name" }, item.author),
              el("span", { class: "media-viewer-author-time" }, [item.time, items.length > 1 ? ` · ${at + 1} из ${items.length}` : ""].join("")),
            ]),
          ])
        : items.length > 1
        ? el("span", { class: "mono media-viewer-counter" }, `${at + 1} из ${items.length}`)
        : null,
      el("span", { class: "media-viewer-spacer" }),
      // В чате с запретом сохранения (chatView ставит класс на body) — без скачивания.
      document.body.classList.contains("protected-chat-open")
        ? null
        : item.originalUrl
        ? el("a", { class: "media-viewer-original", title: "Скачать оригинал", href: item.originalUrl, download: item.name || "file" }, [
            el("span", { html: iconSvg("Download", 18) }),
            el("span", {}, "Скачать оригинал"),
          ])
        : el("a", { class: "icon-btn", title: "Скачать", href: item.url, download: item.name || "file", html: iconSvg("Download", 20) }),
      el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 20), onclick: () => close() })
    );
    captionEl.textContent = item.caption || "";
    captionEl.hidden = !item.caption;
    prevBtn.disabled = at === 0;
    nextBtn.disabled = at === items.length - 1;
  }

  function go(delta) {
    const next = at + delta;
    if (next < 0 || next >= items.length) return;
    at = next;
    show();
  }

  stage.addEventListener(
    "wheel",
    (e) => {
      if (items[at]?.kind === "video") return;
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
    },
    { passive: false }
  );
  stage.addEventListener("dblclick", (e) => {
    if (items[at]?.kind === "video") return;
    if (scale > 1) resetZoom();
    else zoomTo(2.5, e.clientX, e.clientY);
  });

  const pointers = new Map();
  let swipeStartX = null;
  let swipeStartY = null;
  let panStart = null;
  let pinchStart = null;

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
      swipeStartY = e.clientY;
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
    if (panStart || pinchStart || (swipeStartX !== null && Math.abs(e.clientX - swipeStartX) > 8)) gestureAt = Date.now();
    if (pointers.size < 2) pinchStart = null;
    if (panStart) {
      panStart = null;
      return;
    }
    if (swipeStartX !== null) {
      const dx = e.clientX - swipeStartX;
      const dy = swipeStartY == null ? 0 : e.clientY - swipeStartY;
      swipeStartX = null;
      swipeStartY = null;
      // Свайп вниз — закрыть (как в Telegram), вбок — листать.
      if (scale === 1 && dy > 90 && Math.abs(dy) > Math.abs(dx)) return close();
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

  let closed = false;
  function close(fromBack = false) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    if (media?.tagName === "VIDEO") media.pause();
    overlay.remove();
    if (!fromBack) dropHistory();
  }
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
  // Показ — в самом конце, когда объявлено всё, что он использует (спиннер,
  // плашка ошибки, жесты). Раньше вызов стоял выше и падал — фото не открывались.
  show();

  return close;
}

// Автор, время и подпись сообщения с этим медиа — для шапки просмотрщика, как в tweb.
function messageInfo(button) {
  const row = button.closest(".message-row");
  if (!row) return {};
  const mine = row.classList.contains("mine");
  let author = null;
  let avatar = null;
  if (mine) author = "Вы";
  else {
    // аватар и имя стоят только у последнего сообщения в группе — ищем вниз по ленте
    for (let r = row; r; r = r.nextElementSibling) {
      if (!r.classList?.contains("message-row") || r.classList.contains("mine")) break;
      const btn = r.querySelector(".message-avatar-btn");
      if (btn) {
        author = (btn.title || "").replace(/^Профиль:\s*/, "") || null;
        avatar = btn.querySelector(".avatar");
        break;
      }
    }
    author = author || textWithEmoji(row.querySelector(".sender-name-text")) || null;
  }
  const time = row.querySelector(".message-meta-inner .mono, .message-meta .mono")?.textContent || "";
  const textEl = row.querySelector(".bubble .message-text");
  let caption = "";
  if (textEl) {
    const copy = textEl.cloneNode(true);
    copy.querySelectorAll(".message-meta").forEach((m) => m.remove());
    caption = textWithEmoji(copy).trim();
  }
  return { author, avatarHtml: avatar?.outerHTML ?? null, time, caption };
}

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
      fallbackUrl: b.dataset.mediaFallback || null,
      ...messageInfo(b),
    })),
    index,
  };
}
