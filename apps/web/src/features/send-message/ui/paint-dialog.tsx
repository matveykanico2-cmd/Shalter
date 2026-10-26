import { type PointerEvent, useRef, useState } from "react";

import { Button, Dialog } from "@/shared/ui";

import styles from "./drawing.module.css";

const SIZE = 640;
const COLORS = ["#000000", "#ffffff", "#ff5d73", "#ff8a3d", "#ffd23f", "#4ade80", "#38bdf8", "#2e56d9", "#a78bfa", "#f472b6", "#8a5a2b", "#9aa0a6"];
const TOOLS = [
  { id: "pencil", label: "✏️ Карандаш" },
  { id: "eraser", label: "🧽 Ластик" },
  { id: "line", label: "／ Линия" },
  { id: "rect", label: "▭ Прямоугольник" },
  { id: "ellipse", label: "◯ Овал" },
  { id: "circle", label: "● Круг" },
] as const;
type Tool = (typeof TOOLS)[number]["id"];
type Point = { x: number; y: number };
const UNDO_MAX = 25;

type Props = {
  /** «Рисунок» в поле ввода, «Нарисовать стикер» в стикерпаке. */
  title?: string;
  /** Готовый рисунок — PNG 640×640 с прозрачным фоном. */
  onDone: (file: File) => void;
  onClose: () => void;
};

/** Рисовалка — public/js/components/paintDialog.js: карандаш, ластик, фигуры, заливка фона, отмена. */
export function PaintDialog({ title = "Рисунок", onDone, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#000000");
  const [brush, setBrush] = useState(12);
  const [fillShapes, setFillShapes] = useState(false);
  // Ход рисования — не состояние React: перерисовка на каждое движение не нужна.
  const stroke = useRef<{ last: Point | null; start: Point | null; base: ImageData | null } | null>(null);
  const undoStack = useRef<ImageData[]>([]);

  const ctx = () => {
    const c = canvas.current?.getContext("2d");
    if (c) {
      c.lineCap = "round";
      c.lineJoin = "round";
    }
    return c ?? null;
  };
  const snapshot = () => {
    try {
      const c = ctx();
      if (!c) return;
      undoStack.current.push(c.getImageData(0, 0, SIZE, SIZE));
      if (undoStack.current.length > UNDO_MAX) undoStack.current.shift();
    } catch {
      // без отмены этого шага
    }
  };
  const undo = () => {
    const c = ctx();
    const img = undoStack.current.pop();
    if (img) c?.putImageData(img, 0, 0);
    else c?.clearRect(0, 0, SIZE, SIZE);
  };
  const pos = (e: PointerEvent): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const freehand = tool === "pencil" || tool === "eraser";

  const strokeTo = (c: CanvasRenderingContext2D, from: Point, p: Point) => {
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = brush;
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    c.beginPath();
    c.arc(p.x, p.y, brush / 2, 0, Math.PI * 2);
    c.fill();
  };

  const drawShape = (c: CanvasRenderingContext2D, a: Point, b: Point) => {
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = brush;
    if (tool === "line") {
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    } else if (tool === "rect") {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (fillShapes) c.fillRect(x, y, w, h);
      else c.strokeRect(x, y, w, h);
    } else {
      c.beginPath();
      if (tool === "ellipse") c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else c.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
      if (fillShapes) c.fill();
      else c.stroke();
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    if (!c) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    snapshot();
    const p = pos(e);
    if (freehand) {
      strokeTo(c, p, p);
      stroke.current = { last: p, start: null, base: null };
    } else {
      stroke.current = { last: null, start: p, base: c.getImageData(0, 0, SIZE, SIZE) };
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    const c = ctx();
    if (!s || !c) return;
    const p = pos(e);
    if (s.last) {
      strokeTo(c, s.last, p);
      s.last = p;
    } else if (s.start && s.base) {
      // Фигура тянется от точки нажатия: каждый раз поверх снимка до неё.
      c.putImageData(s.base, 0, 0);
      drawShape(c, s.start, p);
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    stroke.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // уже отпущен
    }
  };

  const fillBackground = () => {
    const c = ctx();
    if (!c) return;
    snapshot();
    c.globalCompositeOperation = "destination-over";
    c.fillStyle = color;
    c.fillRect(0, 0, SIZE, SIZE);
    c.globalCompositeOperation = "source-over";
  };
  const clearAll = () => {
    snapshot();
    ctx()?.clearRect(0, 0, SIZE, SIZE);
  };

  const done = async () => {
    const blob = await new Promise<Blob | null>((resolve) => (canvas.current ? canvas.current.toBlob(resolve, "image/png") : resolve(null)));
    onClose();
    if (blob) onDone(new File([blob], "paint.png", { type: "image/png" }));
  };

  const toolClass = (on: boolean) => (on ? `${styles.tool} ${styles.on}` : styles.tool);
  return (
    <Dialog title={title} onClose={onClose} className={styles.paintDialog}>
      <div className={styles.tools}>
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={toolClass(tool === t.id)} aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        <button type="button" className={toolClass(fillShapes)} aria-pressed={fillShapes} title="Заливать фигуры, а не контур" onClick={() => setFillShapes((v) => !v)}>
          Заливка фигур
        </button>
      </div>
      <div className={styles.stage}>
        <canvas
          ref={canvas}
          className={styles.canvas}
          width={SIZE}
          height={SIZE}
          aria-label="Холст"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className={styles.swatches}>
        {COLORS.map((c) => (
          <button key={c} type="button" className={c === color ? `${styles.swatch} ${styles.selected}` : styles.swatch} style={{ background: c }} title={c} aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)} />
        ))}
        <input type="color" className={styles.colorInput} aria-label="Свой цвет" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className={styles.row}>
        <span className={styles.brushLabel}>
          Толщина<span className={styles.brushValue}>{brush}</span>
        </span>
        <input type="range" min={1} max={80} value={brush} aria-label="Толщина" onChange={(e) => setBrush(Number(e.target.value))} />
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.tool} title="Залить фон текущим цветом" onClick={fillBackground}>
          Залить фон
        </button>
        <button type="button" className={styles.tool} title="Отменить" onClick={undo}>
          Отменить
        </button>
        <button type="button" className={styles.tool} title="Очистить" onClick={clearAll}>
          Очистить
        </button>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => void done()}>Готово</Button>
      </div>
    </Dialog>
  );
}
