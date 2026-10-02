import { el, clear } from "../lib/dom.js";

const MAX_DIM = 1080;

const FONT = (size) => `900 ${size}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
const LINE_HEIGHT = 1.15;

function layoutCaption(ctx, text, maxWidth, maxHeight, baseSize) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const minSize = Math.max(10, Math.round(baseSize * 0.35));
  let size = baseSize;
  for (;;) {
    ctx.font = FONT(size);
    const last = size <= minSize;
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

function drawMeme(canvas, imageEl, topText, bottomText) {
  const scale = Math.min(1, MAX_DIM / Math.max(imageEl.naturalWidth, imageEl.naturalHeight));
  const w = Math.max(1, Math.round(imageEl.naturalWidth * scale));
  const h = Math.max(1, Math.round(imageEl.naturalHeight * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageEl, 0, 0, w, h);

  const fontSize = Math.round(Math.min(w, h * 1.2) * 0.1);
  const pad = Math.round(fontSize * 0.3);
  const maxHeight = h * 0.42;
  if (topText.trim()) drawCaption(ctx, topText, w / 2, pad, w * 0.92, maxHeight, fontSize, "top");
  if (bottomText.trim()) drawCaption(ctx, bottomText, w / 2, h - pad, w * 0.92, maxHeight, fontSize, "bottom");
}

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

  const topInput = el("input", { class: "settings-input", placeholder: "Верхний текст", maxlength: 200 });
  const bottomInput = el("input", { class: "settings-input", placeholder: "Нижний текст", maxlength: 200 });
  const canvas = el("canvas", { class: "meme-preview-canvas" });
  const preview = el("div", { class: "meme-preview" }, [canvas]);
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

  function renderStructure() {
    clear(body);
    const ready = !!imgEl?.naturalWidth;
    pickBtn.textContent = ready ? "Выбрать другую картинку" : "Выбрать картинку";
    body.append(pickBtn, fileInput, ...(ready ? [preview, topInput, bottomInput, errorEl, sendBtn] : [errorEl]));
  }

  renderStructure();
}
