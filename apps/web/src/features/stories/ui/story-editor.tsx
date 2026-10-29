import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/ui";

import { bakeStory, baseFontFraction, IMAGE_WIDTH_FRACTION, type Layer, loadImage } from "../lib/story-canvas";

import styles from "./story-editor.module.css";

const STORY_EMOJI = [
  "😀", "😂", "😍", "🥳", "😎", "🤔", "😭", "😮", "😡", "🥰",
  "👍", "👎", "🙏", "👏", "🔥", "💯", "✨", "🎉", "❤️", "💔",
  "⭐", "🌟", "☀️", "🌙", "⚡", "🌈", "🎂", "🎁", "📸", "🎵",
];

const TEXT_COLORS = ["#ffffff", "#1b2130", "#c6403b", "#1f9d63", "#b9791c", "#7c6fd6", "#4a9df8"];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

let uid = 0;

/**
 * Редактор фото истории — как openStoryEditor в public/js/components/storyEditor.js: текст «Aa»,
 * эмодзи и картинки поверх фото, перетаскивание, поворот и масштаб за уголок. «Готово» —
 * новый JPEG 1080×1920, «Пропустить» — исходный файл, «Отмена» и Esc — null.
 * Без файла — статья: белый холст и сразу поле для текста.
 */
export function StoryEditor({ file, onDone }: { file: File | null; onDone: (result: File | null) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [initialText] = useState<Layer | null>(() => (file ? null : { id: ++uid, type: "text", text: "Текст", x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#ffffff", bg: false }));
  const [layers, setLayers] = useState<Layer[]>(() => (initialText ? [initialText] : []));
  const [selectedId, setSelectedId] = useState<number | null>(initialText?.id ?? null);
  const [editingId, setEditingId] = useState<number | null>(initialText?.id ?? null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState({ width: 320, height: 568 });
  const urls = useRef<string[]>([]);
  const latestDone = useRef(onDone);
  useEffect(() => {
    latestDone.current = onDone;
  });

  const objectUrl = (f: Blob) => {
    const url = URL.createObjectURL(f);
    urls.current.push(url);
    return url;
  };

  useEffect(() => {
    if (!file) return;
    let alive = true;
    loadImage(objectUrl(file)).then(
      (img) => alive && setBg(img),
      () => {}
    );
    const list = urls.current;
    return () => {
      alive = false;
      list.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latestDone.current(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Шрифт и ширина картинок — доли размера сцены, как в итоговом кадре.
  useLayoutEffect(() => {
    const measure = () => {
      const r = stageRef.current?.getBoundingClientRect();
      if (r?.width) setStage({ width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const patch = (id: number, p: Partial<Layer>) => setLayers((list) => list.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const addLayer = (partial: Omit<Layer, "id" | "color" | "bg">) => {
    // На белом холсте белый текст не виден — там по умолчанию тёмный.
    const layer: Layer = { id: ++uid, color: file ? "#ffffff" : "#ffffff", bg: false, ...partial };
    setLayers((list) => [...list, layer]);
    setSelectedId(layer.id);
    return layer;
  };

  const addText = () => {
    const layer = addLayer({ type: "text", text: "Текст", x: 0.5, y: 0.5, scale: 1, rotation: 0 });
    setEditingId(layer.id);
  };

  const removeLayer = (id: number) => {
    setLayers((list) => list.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const rect = () => stageRef.current!.getBoundingClientRect();

  const drag = (onMove: (ev: PointerEvent) => void) => {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
  };

  const beginMove = (e: ReactPointerEvent, layer: Layer) => {
    if (editingId === layer.id) return;
    e.stopPropagation();
    setSelectedId(layer.id);
    const r = rect();
    const { clientX: startX, clientY: startY } = e;
    drag((ev) => patch(layer.id, { x: clamp(layer.x + (ev.clientX - startX) / r.width, 0, 1), y: clamp(layer.y + (ev.clientY - startY) / r.height, 0, 1) }));
  };

  const beginTransform = (e: ReactPointerEvent, layer: Layer) => {
    e.stopPropagation();
    e.preventDefault();
    const r = rect();
    const cx = r.left + layer.x * r.width;
    const cy = r.top + layer.y * r.height;
    const startDist = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    drag((ev) => {
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      patch(layer.id, { scale: clamp(layer.scale * (dist / startDist), 0.25, 6), rotation: layer.rotation + ((angle - startAngle) * 180) / Math.PI });
    });
  };

  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (file && !bg) throw new Error("нет фона");
      onDone(await bakeStory(bg, layers));
    } catch {
      if (file) onDone(file);
      else setBusy(false);
    }
  };

  const selected = layers.find((l) => l.id === selectedId);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Редактор истории" onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
      <div className={styles.editor}>
        <div className={styles.topbar}>
          <button type="button" className={styles.iconButton} title="Отмена" aria-label="Отмена" onClick={() => onDone(null)}>
            <Icon name="X" size={20} />
          </button>
          <div className={styles.tools}>
            <button type="button" className={styles.tool} title="Текст" onClick={addText}>
              Aa
            </button>
            <button type="button" className={styles.tool} title="Эмодзи" aria-label="Эмодзи" onClick={() => setEmojiOpen((o) => !o)}>
              <Icon name="Smile" size={18} />
            </button>
            <button type="button" className={styles.tool} title="Картинка" aria-label="Картинка" onClick={() => imgInputRef.current?.click()}>
              <Icon name="Image" size={18} />
            </button>
          </div>
          {file ? (
            <button type="button" className={styles.skip} onClick={() => onDone(file)}>
              Пропустить
            </button>
          ) : null}
        </div>

        <div ref={stageRef} className={file ? styles.stage : `${styles.stage} ${styles.blank}`} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
          {bg ? <img className={styles.bg} src={bg.src} alt="" /> : null}
          {layers.map((layer) => (
            <LayerView
              key={layer.id}
              layer={layer}
              stage={stage}
              selected={layer.id === selectedId}
              editing={layer.id === editingId}
              onPointerDown={(e) => beginMove(e, layer)}
              onDoubleClick={() => layer.type === "text" && setEditingId(layer.id)}
              onTextDone={(text) => {
                patch(layer.id, { text: text.trim() || "Текст" });
                setEditingId(null);
              }}
              onRemove={() => removeLayer(layer.id)}
              onTransform={(e) => beginTransform(e, layer)}
              onToggleBg={() => patch(layer.id, { bg: !layer.bg })}
            />
          ))}
        </div>

        {emojiOpen ? (
          <div className={styles.emojiPanel}>
            {STORY_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  addLayer({ type: "emoji", text: emoji, x: 0.5, y: 0.4, scale: 1, rotation: 0 });
                  setEmojiOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {selected?.type === "text" ? (
          <div className={styles.colors}>
            {TEXT_COLORS.map((color) => (
              <button key={color} type="button" className={styles.colorDot} style={{ background: color }} aria-label={`Цвет ${color}`} onClick={() => patch(selected.id, { color })} />
            ))}
          </div>
        ) : null}
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const img = await loadImage(objectUrl(f)).catch(() => null);
            if (img) addLayer({ type: "image", img, ratio: img.naturalHeight / img.naturalWidth, x: 0.5, y: 0.5, scale: 1, rotation: 0 });
          }}
        />
        <button type="button" className={styles.done} disabled={busy} onClick={() => void done()}>
          {busy ? "Сохраняем…" : "Готово"}
        </button>
      </div>
    </div>,
    document.body
  );
}

type LayerViewProps = {
  layer: Layer;
  stage: { width: number; height: number };
  selected: boolean;
  editing: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onDoubleClick: () => void;
  onTextDone: (text: string) => void;
  onRemove: () => void;
  onTransform: (e: ReactPointerEvent) => void;
  onToggleBg: () => void;
};

function LayerView({ layer, stage, selected, editing, onPointerDown, onDoubleClick, onTextDone, onRemove, onTransform, onToggleBg }: LayerViewProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  // Новый текст — сразу в правку с выделенным «Текст», как startEditingText.
  useEffect(() => {
    const node = textRef.current;
    if (!editing || !node) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const stop = (e: ReactPointerEvent) => e.stopPropagation();
  return (
    <div
      className={selected ? `${styles.layer} ${styles.selected}` : styles.layer}
      style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})` }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {layer.type === "image" ? (
        <img className={styles.layerImg} src={layer.img?.src} alt="" style={{ width: IMAGE_WIDTH_FRACTION * stage.width }} />
      ) : layer.type === "emoji" ? (
        <span className={styles.layerEmoji} style={{ fontSize: baseFontFraction("emoji") * stage.height }}>
          {layer.text}
        </span>
      ) : (
        <span
          // Правленный текст в DOM расходится с React — после правки узел собираем заново.
          key={layer.text}
          ref={textRef}
          className={layer.bg ? `${styles.layerText} ${styles.withBg}` : styles.layerText}
          contentEditable={editing}
          suppressContentEditableWarning
          style={{ fontSize: baseFontFraction("text") * stage.height, color: layer.color }}
          onBlur={(e) => editing && onTextDone(e.currentTarget.textContent ?? "")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        >
          {layer.text}
        </span>
      )}
      {selected ? (
        <>
          <button type="button" className={styles.layerDel} title="Удалить" aria-label="Удалить" onPointerDown={stop} onClick={onRemove}>
            <Icon name="X" size={11} />
          </button>
          <span className={styles.handle} onPointerDown={onTransform} />
          {layer.type === "text" ? (
            <button type="button" className={styles.bgToggle} title="Подложка" onPointerDown={stop} onClick={onToggleBg}>
              A
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
