import { el, clear } from "../lib/dom.js";

// The classic meme maker: your own picture, white-with-black-outline caps
// text top and/or bottom (Impact-alike — most browsers don't ship Impact
// itself, so a bold sans-serif with a thick stroke stands in; it reads the
// same at a glance, which is the part that actually matters for "looks like
// a meme"). Renders to a canvas and hands the result back as a real image
// file, so it drops into the composer's ordinary photo-attachment pipeline
// (composer.js's attachFiles) rather than needing its own send path.
const MAX_DIM = 1080; // export size cap — matches other in-app image exports (storyEditor.js)

function drawCaption(ctx, text, x, y, maxWidth, fontSize) {
  ctx.font = `900 ${fontSize}px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = y < 0 ? "top" : "bottom";
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  ctx.lineJoin = "round";

  // Wraps long captions instead of overflowing the canvas — a meme with
  // more than a few words is common enough that not wrapping would just
  // clip text off the edges.
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = fontSize * 1.15;
  lines.forEach((l, i) => {
    const ly = y < 0 ? -y + i * lineHeight : y - (lines.length - 1 - i) * lineHeight;
    ctx.strokeText(l, x, ly);
    ctx.fillText(l, x, ly);
  });
}

async function renderMeme(imageEl, topText, bottomText) {
  const scale = Math.min(1, MAX_DIM / Math.max(imageEl.naturalWidth, imageEl.naturalHeight));
  const w = Math.round(imageEl.naturalWidth * scale);
  const h = Math.round(imageEl.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageEl, 0, 0, w, h);

  const fontSize = Math.round(w * 0.09);
  const pad = fontSize * 0.15;
  if (topText.trim()) drawCaption(ctx, topText, w / 2, pad, w * 0.92, fontSize);
  if (bottomText.trim()) drawCaption(ctx, bottomText, w / 2, -(h - pad), w * 0.92, fontSize);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
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
    overlay.remove();
  }

  // Built once, outside renderStructure() — re-creating (or even just
  // re-appending) these on every keystroke drops focus after one letter,
  // the same bug the composer/admin-panel comments warn about elsewhere.
  // Typing only ever touches the preview overlay's textContent below.
  const topInput = el("input", { class: "settings-input", placeholder: "Верхний текст", maxlength: 80 });
  const bottomInput = el("input", { class: "settings-input", placeholder: "Нижний текст", maxlength: 80 });
  const topOverlay = el("span", { class: "meme-preview-text meme-preview-top" });
  const bottomOverlay = el("span", { class: "meme-preview-text meme-preview-bottom" });
  const previewImg = el("img", { class: "meme-preview-img" });
  const preview = el("div", { class: "meme-preview" }, [previewImg, topOverlay, bottomOverlay]);
  topInput.addEventListener("input", () => (topOverlay.textContent = topInput.value.toUpperCase()));
  bottomInput.addEventListener("input", () => (bottomOverlay.textContent = bottomInput.value.toUpperCase()));

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
      previewImg.src = objectUrl;
      imgEl = new Image();
      imgEl.src = objectUrl;
      renderStructure();
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
      const blob = await renderMeme(imgEl, topInput.value, bottomInput.value);
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
    pickBtn.textContent = imgEl ? "Выбрать другую картинку" : "Выбрать картинку";
    body.append(pickBtn, fileInput, ...(imgEl ? [preview, topInput, bottomInput, errorEl, sendBtn] : []));
  }

  renderStructure();
}
