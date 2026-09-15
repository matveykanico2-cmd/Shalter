import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// A minimal Instagram/Telegram-style story editor: a photo, plus text, emoji
// and image layers dropped on top of it — each one draggable (move), and
// resizable+rotatable together from one corner handle, the same single-handle
// gesture every story app uses. There's no server-side concept of "layers" —
// this bakes everything onto one flat image before handing it back, so the
// rest of the app (upload, storage, the viewer) never has to know an editor
// exists at all.
//
// Video stories skip this entirely (see storiesBar.js) — baking a moving
// overlay onto a video needs real video encoding, which has no client-side
// answer here; editing stays photo-only.

const EXPORT_W = 1080;
const EXPORT_H = 1920; // 9:16, the aspect every story viewer in the app assumes

const STORY_EMOJI = [
  "😀", "😂", "😍", "🥳", "😎", "🤔", "😭", "😮", "😡", "🥰",
  "👍", "👎", "🙏", "👏", "🔥", "💯", "✨", "🎉", "❤️", "💔",
  "⭐", "🌟", "☀️", "🌙", "⚡", "🌈", "🎂", "🎁", "📸", "🎵",
];

const TEXT_COLORS = ["#ffffff", "#1b2130", "#c6403b", "#1f9d63", "#b9791c", "#7c6fd6", "#4a9df8"];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить картинку"));
    img.src = src;
  });
}

// Draws `img` onto a W×H canvas the way CSS object-fit:cover would — fills
// the frame and crops overflow, rather than letterboxing or distorting it.
function drawCover(ctx, img, w, h) {
  const ir = img.naturalWidth / img.naturalHeight || 1;
  const cr = w / h;
  let sx, sy, sw, sh;
  if (ir > cr) {
    sh = img.naturalHeight;
    sw = sh * cr;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / cr;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

let uid = 0;

// Resolves to a File (the flattened result) once the person hits "Готово" or
// "Пропустить" (skip — uploads the original photo untouched), or to null if
// they cancel this photo outright.
export function openStoryEditor(file) {
  return new Promise((resolve) => {
    let settled = false;
    const objectUrls = [];
    const finish = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      resolve(result);
    };
    function onKey(e) {
      if (e.key === "Escape") finish(null);
    }
    document.addEventListener("keydown", onKey);

    let bgImage = null;
    let layers = [];
    let selectedId = null;
    let busy = false;

    const overlay = el("div", { class: "story-editor-overlay" });
    const stage = el("div", { class: "story-editor-stage" });
    const emojiPanel = el("div", { class: "story-editor-emoji-panel", hidden: true });
    const colorRow = el("div", { class: "story-editor-colors", hidden: true });
    const imgInput = el("input", {
      type: "file",
      accept: "image/*",
      class: "hidden-input",
      onchange: async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        const objUrl = URL.createObjectURL(f);
        objectUrls.push(objUrl);
        const img = await loadImage(objUrl);
        addLayer({ type: "image", img, ratio: img.naturalHeight / img.naturalWidth, x: 0.5, y: 0.5, scale: 1, rotation: 0 });
      },
    });

    const dialog = el("div", { class: "story-editor" }, [
      el("div", { class: "story-editor-topbar" }, [
        el("button", { class: "icon-btn", title: "Отмена", html: iconSvg("X", 20), onclick: () => finish(null) }),
        el("div", { class: "story-editor-tools" }, [
          el("button", { class: "story-editor-tool", title: "Текст", onclick: () => addTextLayer() }, "Aa"),
          el("button", {
            class: "story-editor-tool",
            title: "Эмодзи",
            html: iconSvg("Smile", 18),
            onclick: () => {
              emojiPanel.hidden = !emojiPanel.hidden;
            },
          }),
          el("button", { class: "story-editor-tool", title: "Картинка", html: iconSvg("Image", 18), onclick: () => imgInput.click() }),
        ]),
        el(
          "button",
          { class: "story-editor-skip", onclick: () => finish(file) },
          "Пропустить"
        ),
      ]),
      stage,
      emojiPanel,
      colorRow,
      imgInput,
      el("button", { class: "btn-accent story-editor-done", onclick: bake }, "Готово"),
    ]);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) select(null);
    });

    for (const emoji of STORY_EMOJI) {
      emojiPanel.appendChild(
        el(
          "button",
          {
            onclick: () => {
              addLayer({ type: "emoji", text: emoji, x: 0.5, y: 0.4, scale: 1, rotation: 0 });
              emojiPanel.hidden = true;
            },
          },
          emoji
        )
      );
    }
    for (const color of TEXT_COLORS) {
      colorRow.appendChild(
        el("button", {
          class: "story-editor-color-dot",
          style: { background: color },
          onclick: () => {
            const layer = layers.find((l) => l.id === selectedId);
            if (layer) {
              layer.color = color;
              renderLayer(layer);
            }
          },
        })
      );
    }

    function addLayer(partial) {
      const layer = { id: ++uid, color: "#ffffff", bg: false, ...partial };
      layers.push(layer);
      select(layer.id);
      renderAll();
      return layer;
    }

    function addTextLayer() {
      const layer = addLayer({ type: "text", text: "Текст", x: 0.5, y: 0.5, scale: 1, rotation: 0 });
      startEditingText(layer);
    }

    function select(id) {
      selectedId = id;
      colorRow.hidden = !(id && layers.find((l) => l.id === id)?.type === "text");
      renderAll();
    }

    function removeLayer(id) {
      layers = layers.filter((l) => l.id !== id);
      if (selectedId === id) selectedId = null;
      renderAll();
    }

    // Base sizes as a fraction of the stage's height/width, so the same
    // numbers describe the on-screen preview and the final 1080×1920 export
    // equally — only the pixels-per-fraction differ.
    function baseFontFraction(type) {
      return type === "emoji" ? 0.12 : 0.055;
    }
    function baseImageWidthFraction() {
      return 0.4;
    }

    function stageRect() {
      return stage.getBoundingClientRect();
    }

    function startEditingText(layer) {
      layer.editing = true;
      renderAll();
      const node = stage.querySelector(`[data-layer="${layer.id}"] .story-layer-text`);
      if (!node) return;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function beginMove(e, layer) {
      if (layer.editing) return;
      e.stopPropagation();
      select(layer.id);
      const rect = stageRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = layer.x;
      const origY = layer.y;
      function onMove(ev) {
        layer.x = clamp(origX + (ev.clientX - startX) / rect.width, 0, 1);
        layer.y = clamp(origY + (ev.clientY - startY) / rect.height, 0, 1);
        renderLayer(layer);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    function beginTransform(e, layer) {
      e.stopPropagation();
      e.preventDefault();
      const rect = stageRect();
      const centerX = rect.left + layer.x * rect.width;
      const centerY = rect.top + layer.y * rect.height;
      const startVX = e.clientX - centerX;
      const startVY = e.clientY - centerY;
      const startDist = Math.hypot(startVX, startVY) || 1;
      const startAngle = Math.atan2(startVY, startVX);
      const origScale = layer.scale;
      const origRotation = layer.rotation;
      function onMove(ev) {
        const vx = ev.clientX - centerX;
        const vy = ev.clientY - centerY;
        const dist = Math.hypot(vx, vy);
        const angle = Math.atan2(vy, vx);
        layer.scale = clamp(origScale * (dist / startDist), 0.25, 6);
        layer.rotation = origRotation + ((angle - startAngle) * 180) / Math.PI;
        renderLayer(layer);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    function renderLayer(layer) {
      const wrap = stage.querySelector(`[data-layer="${layer.id}"]`);
      if (!wrap) return;
      wrap.style.left = `${layer.x * 100}%`;
      wrap.style.top = `${layer.y * 100}%`;
      wrap.style.transform = `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`;
    }

    function renderAll() {
      clear(stage);
      if (bgImage) stage.appendChild(el("img", { class: "story-editor-bg", src: bgImage.src, alt: "" }));

      // Absolute pixels off the stage's own current size, not vh/% — the stage
      // itself is capped well below full viewport height (see .story-editor-stage),
      // so a viewport-relative unit here would draw everything oversized.
      const rect = stageRect();
      for (const layer of layers) {
        const selected = layer.id === selectedId;
        let content;
        if (layer.type === "image") {
          content = el("img", { class: "story-layer-img", src: layer.img.src, alt: "", style: { width: `${baseImageWidthFraction() * rect.width}px` } });
        } else if (layer.type === "emoji") {
          content = el("span", { class: "story-layer-emoji", style: { fontSize: `${baseFontFraction("emoji") * rect.height}px` } }, layer.text);
        } else {
          content = el(
            "span",
            {
              class: `story-layer-text ${layer.bg ? "with-bg" : ""}`,
              contenteditable: layer.editing ? "true" : "false",
              style: { fontSize: `${baseFontFraction("text") * rect.height}px`, color: layer.color },
              onblur: (e) => {
                layer.text = e.target.textContent.trim() || "Текст";
                layer.editing = false;
                renderAll();
              },
              onkeydown: (e) => {
                if (e.key === "Enter") e.target.blur();
              },
            },
            layer.text
          );
        }

        const wrap = el(
          "div",
          {
            class: `story-layer ${selected ? "selected" : ""}`,
            "data-layer": String(layer.id),
            style: {
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
            },
            onpointerdown: (e) => beginMove(e, layer),
            ondblclick: () => layer.type === "text" && startEditingText(layer),
          },
          [
            content,
            selected
              ? el("button", {
                  class: "story-layer-del",
                  title: "Удалить",
                  onpointerdown: (e) => e.stopPropagation(),
                  onclick: () => removeLayer(layer.id),
                  html: iconSvg("X", 11),
                })
              : null,
            selected
              ? el("span", { class: "story-layer-handle", onpointerdown: (e) => beginTransform(e, layer) })
              : null,
            layer.type === "text" && selected
              ? el("button", {
                  class: "story-layer-bg-toggle",
                  title: "Подложка",
                  onpointerdown: (e) => e.stopPropagation(),
                  onclick: () => {
                    layer.bg = !layer.bg;
                    renderAll();
                  },
                }, "A")
              : null,
          ].filter(Boolean)
        );
        stage.appendChild(wrap);
      }
    }

    async function bake() {
      if (busy) return;
      busy = true;
      const doneBtn = dialog.querySelector(".story-editor-done");
      doneBtn.disabled = true;
      doneBtn.textContent = "Сохраняем…";
      try {
        const canvas = document.createElement("canvas");
        canvas.width = EXPORT_W;
        canvas.height = EXPORT_H;
        const ctx = canvas.getContext("2d");
        drawCover(ctx, bgImage, EXPORT_W, EXPORT_H);

        for (const layer of layers) {
          ctx.save();
          ctx.translate(layer.x * EXPORT_W, layer.y * EXPORT_H);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.scale(layer.scale, layer.scale);
          if (layer.type === "image") {
            const w = baseImageWidthFraction() * EXPORT_W;
            const h = w * layer.ratio;
            ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
          } else {
            const fontSize = baseFontFraction(layer.type) * EXPORT_H;
            ctx.font = `${layer.type === "text" ? "700 " : ""}${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (layer.type === "text" && layer.bg) {
              const metrics = ctx.measureText(layer.text);
              const padX = fontSize * 0.35;
              const padY = fontSize * 0.28;
              const w = metrics.width + padX * 2;
              const h = fontSize + padY * 2;
              ctx.fillStyle = "rgba(0,0,0,0.55)";
              roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
              ctx.fill();
            }
            ctx.fillStyle = layer.type === "emoji" ? "#000" : layer.color;
            ctx.fillText(layer.text, 0, 0);
          }
          ctx.restore();
        }

        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
        if (!blob) throw new Error("empty canvas");
        finish(new File([blob], "story.jpg", { type: "image/jpeg" }));
      } catch {
        finish(file); // export failed for some reason — fall back to the untouched photo rather than losing it
      }
    }

    const bgObjUrl = URL.createObjectURL(file);
    objectUrls.push(bgObjUrl);
    loadImage(bgObjUrl).then((img) => {
      bgImage = img;
      renderAll();
    });
  });
}
