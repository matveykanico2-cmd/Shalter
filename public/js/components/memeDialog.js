import { el, clear } from "../lib/dom.js";

// The classic meme maker: your own picture, white-with-black-outline caps
// text top and/or bottom (Impact-alike — most browsers don't ship Impact
// itself, so a bold sans-serif with a thick stroke stands in; it reads the
// same at a glance, which is the part that actually matters for "looks like
// a meme"). Renders to a canvas and hands the result back as a real image
// file, so it drops into the composer's ordinary photo-attachment pipeline
// (composer.js's attachFiles) rather than needing its own send path.
const MAX_DIM = 1080; // export size cap — matches other in-app image exports (storyEditor.js)

const FONT = (size) => `900 ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
const LINE_HEIGHT = 1.15;

// Разбивает надпись на строки и подбирает размер шрифта так, чтобы она целиком
// поместилась: каждая строка — в ширину, все вместе — в maxHeight.
//
// Раньше размер был один на все случаи, и надпись обрезалась: длинное слово
// («достопримечательности» на узкой картинке) вылезало за оба края, а длинный
// текст уходил за край кадра или наезжал на вторую надпись. Теперь шрифт
// уменьшается, пока всё не влезет, а слово, которое не влезает и самым мелким
// шрифтом, переносится по буквам.
function layoutCaption(ctx, text, maxWidth, maxHeight, baseSize) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const minSize = Math.max(10, Math.round(baseSize * 0.35));
  let size = baseSize;
  for (;;) {
    ctx.font = FONT(size);
    const last = size <= minSize;
    // На последнем шаге слишком длинные слова режутся по буквам.
    const pieces = last ? words.flatMap((w) => splitWord(ctx, w, maxWidth)) : words;
    const lines = [];
    let line = "";
    let fits = true;
    for (const w of pieces) {
      if (ctx.measureText(w).width > maxWidth) fits = false;
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length * size * LINE_HEIGHT > maxHeight) fits = false;
    if (fits || last) return { size, lines };
    size = Math.max(minSize, Math.floor(size * 0.9));
  }
}

function splitWord(ctx, word, maxWidth) {
  if (ctx.measureText(word).width <= maxWidth) return [word];
  const parts = [];
  let part = "";
  for (const ch of word) {
    if (part && ctx.measureText(part + ch).width > maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part) parts.push(part);
  return parts;
}

// anchor: "top" — y это верхний край первой строки, "bottom" — нижний край
// последней.
//
// Раньше край выводился из знака y, и выводился наоборот: верхняя надпись
// вставала нижним краем на отступ сверху, то есть целиком над картинкой, а
// нижняя — под ней. В превью текст был (там он HTML поверх картинки), а в
// отправленном файле мем уходил без надписей.
function drawCaption(ctx, text, x, y, maxWidth, maxHeight, baseSize, anchor) {
  const { size, lines } = layoutCaption(ctx, text, maxWidth, maxHeight, baseSize);
  ctx.font = FONT(size);
  ctx.textAlign = "center";
  ctx.textBaseline = anchor;
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  ctx.lineJoin = "round";
  const lineHeight = size * LINE_HEIGHT;
  lines.forEach((l, i) => {
    const ly = anchor === "top" ? y + i * lineHeight : y - (lines.length - 1 - i) * lineHeight;
    ctx.strokeText(l, x, ly);
    ctx.fillText(l, x, ly);
  });
}

// Рисует мем на холст — один и тот же для превью в окне и для отправки.
//
// Раньше превью было HTML-текстом поверх <img>: другой шрифт, другой размер,
// другая обводка, — а отправлялась отдельно нарисованная картинка. Что видел
// человек и что уходило в чат, не совпадало, и на отправке всё рисовалось
// заново. Теперь превью и есть отправляемая картинка.
function drawMeme(canvas, imageEl, topText, bottomText) {
  const scale = Math.min(1, MAX_DIM / Math.max(imageEl.naturalWidth, imageEl.naturalHeight));
  const w = Math.max(1, Math.round(imageEl.naturalWidth * scale));
  const h = Math.max(1, Math.round(imageEl.naturalHeight * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageEl, 0, 0, w, h);

  // От меньшей стороны, а не от ширины: на высокой узкой картинке надпись от
  // ширины выходила мелкой, на широкой низкой — закрывала полкадра.
  const fontSize = Math.round(Math.min(w, h * 1.2) * 0.1);
  const pad = Math.round(fontSize * 0.3);
  // Каждой надписи — не больше 42% высоты: верхняя и нижняя не наезжают друг
  // на друга, и середина картинки остаётся видна.
  const maxHeight = h * 0.42;
  if (topText.trim()) drawCaption(ctx, topText, w / 2, pad, w * 0.92, maxHeight, fontSize, "top");
  if (bottomText.trim()) drawCaption(ctx, bottomText, w / 2, h - pad, w * 0.92, maxHeight, fontSize, "bottom");
}

// onDone(file) — called with a real File (image/jpeg) once "Отправить"
// is pressed; the caller attaches it like any picked photo.
export function openMemeDialog(onDone) {
  let imgEl = null;
  let objectUrl = null;
  let busy = false;
  let error = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "meme-dialog-body" });
  const dialog = el("div", { class: "modal-dialog meme-dialog" }, [
    el("h2", { class: "modal-title" }, "Мем"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  // Built once, outside renderStructure() — re-creating (or even just
  // re-appending) these on every keystroke drops focus after one letter,
  // the same bug the composer/admin-panel comments warn about elsewhere.
  // Typing only ever touches the preview overlay's textContent below.
  const topInput = el("input", { class: "settings-input", placeholder: "Верхний текст", maxlength: 200 });
  const bottomInput = el("input", { class: "settings-input", placeholder: "Нижний текст", maxlength: 200 });
  const canvas = el("canvas", { class: "meme-preview-canvas" });
  const preview = el("div", { class: "meme-preview" }, [canvas]);
  // Перерисовка — не чаще кадра: быстрый набор не должен рисовать картинку
  // по три раза между кадрами экрана.
  let frame = 0;
  function redraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (imgEl?.naturalWidth) drawMeme(canvas, imgEl, topInput.value, bottomInput.value);
    });
  }
  topInput.addEventListener("input", redraw);
  bottomInput.addEventListener("input", redraw);
  // Enter в верхнем поле — к нижнему, в нижнем — отправить.
  topInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      bottomInput.focus();
    }
  });
  bottomInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (imgEl !== img) return;
        drawMeme(canvas, img, topInput.value, bottomInput.value);
        renderStructure();
        topInput.focus();
      };
      img.onerror = () => {
        if (imgEl !== img) return;
        imgEl = null;
        errorEl.textContent = "Не удалось открыть картинку";
        renderStructure();
      };
      imgEl = img;
      img.src = objectUrl;
    },
  });

  const pickBtn = el("button", { class: "profile-action-btn", onclick: () => fileInput.click() }, "Выбрать картинку");
  const errorEl = el("p", { class: "login-error" });
  const sendBtn = el("button", { class: "btn-accent", onclick: send }, "Отправить");

  async function send() {
    if (busy || !imgEl) return;
    busy = true;
    errorEl.textContent = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "Готовим…";
    try {
      // Холст уже нарисован превью — только дорисовать последнее нажатие.
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      drawMeme(canvas, imgEl, topInput.value, bottomInput.value);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Не удалось создать картинку");
      const file = new File([blob], "meme.jpg", { type: "image/jpeg" });
      close();
      onDone(file);
      return;
    } catch (err) {
      errorEl.textContent = err.message || "Не удалось создать мем";
    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Отправить";
    }
  }

  // Rebuilds only which *blocks* are visible (no picture yet vs. picture
  // picked) — never touches topInput/bottomInput's own DOM identity.
  function renderStructure() {
    clear(body);
    const ready = !!imgEl?.naturalWidth;
    pickBtn.textContent = ready ? "Выбрать другую картинку" : "Выбрать картинку";
    body.append(pickBtn, fileInput, ...(ready ? [preview, topInput, bottomInput, errorEl, sendBtn] : [errorEl]));
  }

  renderStructure();
}
