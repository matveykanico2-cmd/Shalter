import { el } from "../lib/dom.js";

// Пейнт — отдельный инструмент рисования: холст, набор инструментов (карандаш,
// ластик, линия, прямоугольник, овал, круг), заливка фигур, палитра цветов,
// толщина, заливка фона, отмена, очистка. Отдаёт результат готовым PNG-файлом
// через onDone(file) — как мемо-редактор (components/memeDialog.js), поэтому
// встраивается в любой поток, принимающий картинку (композер, стикерпаки).
//
// Фон по умолчанию прозрачный (PNG), сзади шахматка — видно прозрачность.

const SIZE = 640; // внутренний размер холста, px
const COLORS = [
  "#000000", "#ffffff", "#ff5d73", "#ff8a3d", "#ffd23f", "#4ade80",
  "#38bdf8", "#2e56d9", "#a78bfa", "#f472b6", "#8a5a2b", "#9aa0a6",
];
const TOOLS = [
  { id: "pencil", label: "✏️ Карандаш" },
  { id: "eraser", label: "🧽 Ластик" },
  { id: "line", label: "／ Линия" },
  { id: "rect", label: "▭ Прямоугольник" },
  { id: "ellipse", label: "◯ Овал" },
  { id: "circle", label: "● Круг" },
];

// onDone(file) — вызывается с настоящим File (image/png) по кнопке «Готово».
export function openPaintDialog(onDone, { title = "Рисунок" } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  const canvas = el("canvas", { class: "paint-canvas", width: SIZE, height: SIZE });
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let color = "#000000";
  let brush = 12;
  let tool = "pencil";
  let fillShapes = false; // фигуры: заливка или контур
  let drawing = false;
  let last = null;
  let startPt = null;
  let baseImage = null; // снимок до фигуры (для «резинового» предпросмотра)
  const undoStack = [];
  const UNDO_MAX = 25;

  function snapshot() {
    try {
      undoStack.push(ctx.getImageData(0, 0, SIZE, SIZE));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch {
      /* getImageData на своём холсте не тайнится — на всякий случай глушим */
    }
  }
  function undo() {
    const img = undoStack.pop();
    if (img) ctx.putImageData(img, 0, 0);
    else ctx.clearRect(0, 0, SIZE, SIZE);
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  }

  // Карандаш/ластик — след кистью.
  function strokeTo(p) {
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brush;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
    last = p;
  }

  // Готовая фигура от startPt к текущей точке.
  function drawShape(a, b) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brush;
    if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      return;
    }
    if (tool === "rect") {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (fillShapes) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
      return;
    }
    if (tool === "ellipse") {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      fillShapes ? ctx.fill() : ctx.stroke();
      return;
    }
    if (tool === "circle") {
      // Круг из центра (первая точка) радиусом до текущей.
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      fillShapes ? ctx.fill() : ctx.stroke();
      return;
    }
  }

  const isFreehand = () => tool === "pencil" || tool === "eraser";

  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    snapshot();
    const p = pos(e);
    if (isFreehand()) {
      last = p;
      strokeTo(p);
    } else {
      startPt = p;
      baseImage = ctx.getImageData(0, 0, SIZE, SIZE);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    if (isFreehand()) {
      strokeTo(p);
    } else if (baseImage) {
      // Предпросмотр фигуры: восстанавливаем холст и рисуем заново от начала.
      ctx.putImageData(baseImage, 0, 0);
      drawShape(startPt, p);
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    drawing = false;
    startPt = null;
    baseImage = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  });

  // ── Панель инструментов ──────────────────────────────────────────────────
  const toolBtns = TOOLS.map((t) =>
    el("button", { class: `paint-tool ${tool === t.id ? "on" : ""}`, onclick: () => { tool = t.id; refreshTools(); } }, t.label)
  );
  const fillBtn = el("button", { class: `paint-tool ${fillShapes ? "on" : ""}`, title: "Заливать фигуры, а не контур", onclick: () => { fillShapes = !fillShapes; refreshTools(); } }, "Заливка фигур");

  const swatches = COLORS.map((c) =>
    el("button", { class: `paint-swatch ${c === color ? "sel" : ""}`, style: { background: c }, title: c, onclick: () => { color = c; refreshTools(); } })
  );
  const customColor = el("input", { type: "color", class: "paint-color-input", value: "#000000", oninput: (e) => { color = e.target.value; refreshTools(); } });

  const brushLabel = el("span", { class: "paint-brush-val" }, String(brush));
  const brushInput = el("input", { type: "range", min: 1, max: 80, value: brush, oninput: (e) => { brush = Number(e.target.value); brushLabel.textContent = String(brush); } });

  const bgBtn = el("button", { class: "paint-tool", title: "Залить фон текущим цветом", onclick: () => {
    snapshot();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = "source-over";
  } }, "Залить фон");

  function refreshTools() {
    toolBtns.forEach((b, i) => b.classList.toggle("on", tool === TOOLS[i].id));
    fillBtn.classList.toggle("on", fillShapes);
    swatches.forEach((b, i) => b.classList.toggle("sel", COLORS[i] === color));
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
    el("div", { class: "paint-tools" }, [...toolBtns, fillBtn]),
    el("div", { class: "paint-stage" }, [canvas]),
    el("div", { class: "paint-swatches" }, [...swatches, customColor]),
    el("div", { class: "paint-row" }, [el("span", { class: "paint-brush-label" }, ["Толщина", brushLabel]), brushInput]),
    el("div", { class: "paint-row" }, [
      bgBtn,
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
