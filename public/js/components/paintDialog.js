import { el } from "../lib/dom.js";

// Пейнт — отдельный инструмент свободного рисования кистью (не аниматор): холст,
// кисть с цветом и размером, ластик, заливка фона, отмена, очистка. Отдаёт
// результат готовым PNG-файлом через onDone(file) — тем же способом, что и
// мемо-редактор (components/memeDialog.js), поэтому вставляется в любой поток,
// который принимает картинку: композер (отправить рисунок), стикерпаки
// (нарисовать картинку-стикер) и т.д.
//
// Фон по умолчанию прозрачный (PNG), поэтому рисунок годится и как стикер;
// сзади показывается шахматка, чтобы прозрачность была видна.

const SIZE = 640; // внутренний размер холста, px
const COLORS = ["#000000", "#ffffff", "#ff5d73", "#ff8a3d", "#ffd23f", "#4ade80", "#38bdf8", "#2e56d9", "#a78bfa", "#f472b6", "#8a5a2b", "#9aa0a6"];

// onDone(file) — вызывается с настоящим File (image/png) по кнопке «Готово».
export function openPaintDialog(onDone, { title = "Рисунок" } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  const canvas = el("canvas", { class: "paint-canvas", width: SIZE, height: SIZE });
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let color = "#000000";
  let brush = 12;
  let erasing = false;
  let drawing = false;
  let last = null;
  // Стек снимков для отмены (ImageData). Кладём снимок перед каждым штрихом.
  const undoStack = [];
  const UNDO_MAX = 25;

  function snapshot() {
    try {
      undoStack.push(ctx.getImageData(0, 0, SIZE, SIZE));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch {
      /* getImageData может бросить на «грязном» холсте — здесь холст всегда свой */
    }
  }
  function undo() {
    const img = undoStack.pop();
    if (img) ctx.putImageData(img, 0, 0);
    else ctx.clearRect(0, 0, SIZE, SIZE);
  }

  // Экранные координаты указателя → координаты холста (холст масштабируется CSS).
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  }
  function strokeTo(p) {
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = brush;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // Точка в начале, чтобы одиночный тап тоже оставлял след.
    ctx.beginPath();
    ctx.arc(p.x, p.y, brush / 2, 0, Math.PI * 2);
    ctx.fillStyle = erasing ? "rgba(0,0,0,1)" : color;
    ctx.fill();
    last = p;
  }
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    snapshot();
    last = pos(e);
    strokeTo(last);
  });
  canvas.addEventListener("pointermove", (e) => drawing && strokeTo(pos(e)));
  canvas.addEventListener("pointerup", (e) => {
    drawing = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  });

  // ── Панель инструментов ──────────────────────────────────────────────────
  const swatches = COLORS.map((c) =>
    el("button", {
      class: `paint-swatch ${c === color && !erasing ? "sel" : ""}`,
      style: { background: c },
      title: c,
      onclick: () => { color = c; erasing = false; refreshTools(); },
    })
  );
  const customColor = el("input", {
    type: "color",
    class: "paint-color-input",
    value: "#000000",
    oninput: (e) => { color = e.target.value; erasing = false; refreshTools(); },
  });
  const eraserBtn = el("button", { class: "paint-tool", onclick: () => { erasing = !erasing; refreshTools(); } }, "Ластик");
  const brushLabel = el("span", { class: "paint-brush-val" }, String(brush));
  const brushInput = el("input", {
    type: "range", min: 1, max: 80, value: brush,
    oninput: (e) => { brush = Number(e.target.value); brushLabel.textContent = String(brush); },
  });
  const fillBtn = el("button", { class: "paint-tool", title: "Залить фон текущим цветом", onclick: () => {
    snapshot();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = "source-over";
  } }, "Залить фон");

  const swatchesRow = el("div", { class: "paint-swatches" }, [...swatches, customColor]);
  function refreshTools() {
    swatches.forEach((b, i) => b.classList.toggle("sel", COLORS[i] === color && !erasing));
    eraserBtn.classList.toggle("on", erasing);
  }

  function close() { overlay.remove(); }

  async function done() {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return close();
    const file = new File([blob], "paint.png", { type: "image/png" });
    close();
    onDone?.(file);
  }

  const dialog = el("div", { class: "modal-dialog paint-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    el("div", { class: "paint-stage" }, [canvas]),
    swatchesRow,
    el("div", { class: "paint-row" }, [
      el("span", { class: "paint-brush-label" }, ["Кисть", brushLabel]),
      brushInput,
    ]),
    el("div", { class: "paint-row" }, [
      eraserBtn,
      fillBtn,
      el("button", { class: "paint-tool", title: "Отменить", onclick: undo }, "Отменить"),
      el("button", { class: "paint-tool", title: "Очистить", onclick: () => { snapshot(); ctx.clearRect(0, 0, SIZE, SIZE); } }, "Очистить"),
    ]),
    el("div", { class: "anim-actions" }, [
      el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
      el("button", { class: "anim-save-btn", onclick: done }, "Готово"),
    ]),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  refreshTools();
}
