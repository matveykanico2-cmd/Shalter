// Аниматор: редактор своих сцен (эмодзи, рисунки подарков) — перенос openAnimatorEditor
// из public/js/components/animatorEditor.js. Строит DOM сам, как весь движок anim;
// в React его ставит shared/ui/AnimatorDialog.
import "./animator-editor.css";

import { ALL_EMOJI } from "../emoji-list";

import { blankScene, CE_MAX_KEYS, CE_MAX_LAYERS, CE_SHAPES, type CustomScene, type Layer, renderCustomScene, sampleLayerAt, sanitizeCustomScene } from "./custom-scene";

const COLOR_SWATCHES = ["#ff8a3d", "#ff5d73", "#ffd23f", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#ffffff", "#2f2a24"];
const PREVIEW = 240;

type Key = NonNullable<Layer["keys"]>[number];
type Stroke = NonNullable<Layer["strokes"]>[number];
type EditLayer = Layer & { keys: Key[] };
type Pose = ReturnType<typeof sampleLayerAt>;
type PoseFields = Omit<Key, "t">;

type Attrs = Record<string, unknown> & { class?: string; style?: Partial<CSSStyleDeclaration> };
type Child = Node | string | null | undefined | false;

/** Узел с атрибутами и детьми — el() из public/js/lib/dom.js. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Child | Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v as EventListener);
    else if (k in node && k !== "list") (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c == null || c === false) continue;
    node.append(c);
  }
  return node;
}

const round = (n: number) => Math.round(n * 100) / 100;

function defaultLayer(type: string): EditLayer {
  const base: EditLayer = { type, x: 50, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 0, keys: [] };
  if (type === "draw") return { ...base, fill: "#000000", strokes: [] };
  if (type === "emoji") return { ...base, emoji: "😀", size: 44 };
  if (type === "text") return { ...base, text: "текст", size: 18, fill: "#2f2a24" };
  if (type === "circle") return { ...base, r: 18 };
  if (type === "rect") return { ...base, w: 40, h: 28, rx: 6 };
  if (type === "ellipse") return { ...base, w: 46, h: 30 };
  if (type === "star") return { ...base, size: 40, fill: "#ffd23f" };
  if (type === "heart") return { ...base, size: 38, fill: "#ff5d73" };
  return base;
}

export type AnimatorEditor = {
  /** Корень редактора: холст, слои, свойства, таймлайн и строка ошибки. */
  node: HTMLElement;
  /** Очищенная сцена или null (пустая — под холстом появится ошибка). */
  result: () => CustomScene | null;
  /** Остановить проигрывание. */
  destroy: () => void;
};

export function createAnimatorEditor(initial: unknown = null): AnimatorEditor {
  const scene = (initial ? sanitizeCustomScene(initial) : blankScene()) as Omit<CustomScene, "layers"> & { layers: EditLayer[] };
  for (const l of scene.layers) if (!Array.isArray(l.keys)) l.keys = [];
  let selected = scene.layers.length ? 0 : -1;
  let time = 0;
  let playing = false;
  let autokey = true;
  let error: string | null = null;
  let raf = 0;
  let playStart = 0;
  let brushMode = true;
  let brushColor = "#000000";
  let brushWidth = 4;
  let curStroke: Stroke | null = null;

  const previewBox = el("div", { class: "anim-preview" });
  const layerListEl = el("div", { class: "anim-layers" });
  const panelEl = el("div", { class: "anim-panel" });
  const errorEl = el("p", { class: "anim-error", role: "alert" });
  const timelineEl = el("div", { class: "anim-timeline" });
  const timeLabel = el("span", { class: "anim-time-label" });

  const sel = (): EditLayer | null => (selected >= 0 ? (scene.layers[selected] ?? null) : null);
  const clampT = (t: number) => Math.min(scene.loop, Math.max(0, Math.round(t * 100) / 100));

  function refreshPreview() {
    const svg = renderCustomScene(scene, { size: PREVIEW, atTime: playing ? null : time });
    const L = sel();
    if (L && !playing && L.type !== "draw") {
      const p = sampleLayerAt(L, time);
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", String(L.x + p.dx));
      ring.setAttribute("cy", String(L.y + p.dy));
      ring.setAttribute("r", "6");
      ring.setAttribute("class", "anim-marker");
      svg.appendChild(ring);
    }
    previewBox.replaceChildren(svg);
  }

  function toViewbox(clientX: number, clientY: number) {
    const svg = previewBox.querySelector("svg");
    const r = (svg ?? previewBox).getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / (r.width || 1)) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / (r.height || 1)) * 100)),
    };
  }

  let dragging = false;
  const isBrush = () => brushMode && sel()?.type === "draw";

  previewBox.addEventListener("pointerdown", (e) => {
    const L = sel();
    if (!L || playing) return;
    previewBox.setPointerCapture?.(e.pointerId);
    if (isBrush()) {
      const v = toViewbox(e.clientX, e.clientY);
      curStroke = { color: brushColor, width: brushWidth, pts: [[round(v.x), round(v.y)]] };
      (L.strokes ??= []).push(curStroke);
      refreshPreview();
    } else {
      dragging = true;
      moveTo(e.clientX, e.clientY);
    }
  });
  previewBox.addEventListener("pointermove", (e) => {
    if (curStroke) {
      const v = toViewbox(e.clientX, e.clientY);
      const pts = curStroke.pts;
      const lastPt = pts[pts.length - 1];
      if (!lastPt || Math.hypot(v.x - lastPt[0], v.y - lastPt[1]) > 0.6) {
        pts.push([round(v.x), round(v.y)]);
        refreshPreview();
      }
    } else if (dragging) {
      moveTo(e.clientX, e.clientY);
    }
  });
  previewBox.addEventListener("pointerup", (e) => {
    if (curStroke) {
      curStroke = null;
      renderPanel();
    }
    dragging = false;
    try {
      previewBox.releasePointerCapture?.(e.pointerId);
    } catch {
      /* захвата уже нет */
    }
  });

  function moveTo(clientX: number, clientY: number) {
    const L = sel();
    if (!L) return;
    const v = toViewbox(clientX, clientY);
    if (autokey) {
      const p = sampleLayerAt(L, time);
      upsertKey(L, { ...poseFields(p), dx: v.x - L.x, dy: v.y - L.y });
    } else {
      L.x = Math.round(v.x);
      L.y = Math.round(v.y);
    }
    refreshPreview();
    renderPanel();
    drawTimeline();
  }

  function poseFields(p: Pose): PoseFields {
    const o: PoseFields = { dx: p.dx, dy: p.dy, rot: p.rot, scale: p.scale, opacity: p.opacity };
    if (p.fill) o.fill = p.fill;
    return o;
  }
  const keyEps = () => Math.max(0.03, scene.loop * 0.01);
  function keyIndexAt(L: EditLayer, t: number) {
    const eps = keyEps();
    return L.keys.findIndex((k) => Math.abs(k.t - t) <= eps);
  }
  function upsertKey(L: EditLayer, pose: Partial<PoseFields>) {
    if (L.keys.length >= CE_MAX_KEYS && keyIndexAt(L, time) < 0) {
      error = `Не больше ${CE_MAX_KEYS} ключей на слой`;
      renderAll();
      return;
    }
    error = null;
    const i = keyIndexAt(L, time);
    const rec: Key = { t: i >= 0 ? L.keys[i]!.t : clampT(time), dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1, ...pose };
    if (i >= 0) L.keys[i] = rec;
    else {
      L.keys.push(rec);
      L.keys.sort((a, b) => a.t - b.t);
    }
  }
  function deleteKeyAt(L: EditLayer) {
    const i = keyIndexAt(L, time);
    if (i >= 0) L.keys.splice(i, 1);
  }

  function selectLayer(i: number) {
    selected = i;
    renderAll();
  }
  function addLayer(type: string) {
    if (scene.layers.length >= CE_MAX_LAYERS) {
      error = `Не больше ${CE_MAX_LAYERS} фигур`;
      renderAll();
      return;
    }
    error = null;
    scene.layers.push(defaultLayer(type));
    selected = scene.layers.length - 1;
    brushMode = type === "draw";
    renderAll();
  }
  function removeLayer(i: number) {
    scene.layers.splice(i, 1);
    if (selected >= scene.layers.length) selected = scene.layers.length - 1;
    renderAll();
  }
  function moveLayer(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= scene.layers.length) return;
    const [layer] = scene.layers.splice(i, 1);
    scene.layers.splice(j, 0, layer!);
    selected = j;
    renderAll();
  }

  function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) {
    const val = el("span", { class: "anim-ctl-val" }, String(round(get())));
    const input = el("input", {
      type: "range",
      min,
      max,
      step,
      value: String(get()),
      "aria-label": label,
      oninput: (e: Event) => {
        const v = Number((e.target as HTMLInputElement).value);
        set(v);
        val.textContent = String(round(v));
        refreshPreview();
      },
    });
    return el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, [label, val]), input]);
  }

  function colorRow(label: string, get: () => string | null | undefined, set: (v: string) => void) {
    const swatches = COLOR_SWATCHES.map((c) =>
      el("button", {
        type: "button",
        class: `anim-swatch ${get() === c ? "sel" : ""}`,
        style: { background: c },
        title: c,
        onclick: () => {
          set(c);
          renderPanel();
          refreshPreview();
        },
      })
    );
    const current = get() ?? "";
    const picker = el("input", {
      type: "color",
      class: "anim-color-input",
      value: /^#[0-9a-f]{6}$/i.test(current) ? current : "#ff8a3d",
      oninput: (e: Event) => {
        set((e.target as HTMLInputElement).value);
        refreshPreview();
      },
    });
    return el("div", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, label), el("div", { class: "anim-swatches" }, [...swatches, picker])]);
  }

  const btn = (cls: string, text: string, onclick: () => void, extra: Attrs = {}) => el("button", { type: "button", class: cls, onclick, ...extra }, text);

  function renderPanel() {
    panelEl.replaceChildren();
    const L = sel();
    if (!L) {
      panelEl.appendChild(el("p", { class: "anim-hint" }, "Добавьте фигуру или эмодзи, чтобы начать."));
      return;
    }

    const baseRows: Node[] = [];
    if (L.type === "draw") {
      const strokes = (L.strokes ??= []);
      baseRows.push(
        el("p", { class: "anim-hint" }, brushMode ? "Рисуйте прямо на холсте." : "Перетаскивайте рисунок на холсте (запишется ключом)."),
        el("div", { class: "anim-key-actions" }, [
          btn(`anim-add-btn ${brushMode ? "" : "danger"}`, brushMode ? "✏️ Рисую" : "✋ Двигаю", () => {
            brushMode = !brushMode;
            renderPanel();
          }),
        ]),
        colorRow("Цвет кисти", () => brushColor, (v) => (brushColor = v)),
        slider("Толщина", 1, 40, 1, () => brushWidth, (v) => (brushWidth = v)),
        el("div", { class: "anim-key-actions" }, [
          btn("anim-add-btn", "Отменить штрих", () => {
            strokes.pop();
            refreshPreview();
            renderPanel();
          }),
          btn("anim-add-btn danger", "Очистить рисунок", () => {
            L.strokes = [];
            refreshPreview();
            renderPanel();
          }),
          el("span", { class: "anim-ctl-val" }, `${strokes.length} штрихов`),
        ])
      );
    } else if (L.type === "emoji") {
      const emojiInput = el("input", {
        type: "text",
        class: "anim-text-input",
        value: L.emoji ?? "",
        maxLength: 8,
        oninput: (e: Event) => {
          L.emoji = (e.target as HTMLInputElement).value;
          refreshPreview();
        },
      });
      const grid = el(
        "div",
        { class: "anim-emoji-grid" },
        ALL_EMOJI.map((em) =>
          btn("anim-emoji-btn", em, () => {
            L.emoji = em;
            emojiInput.value = em;
            refreshPreview();
          })
        )
      );
      baseRows.push(el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, "Эмодзи"), emojiInput]), grid, slider("Размер", 6, 100, 1, () => L.size ?? 44, (v) => (L.size = v)));
    } else if (L.type === "text") {
      baseRows.push(
        el("label", { class: "anim-ctl" }, [
          el("span", { class: "anim-ctl-label" }, "Текст"),
          el("input", {
            type: "text",
            class: "anim-text-input",
            value: L.text ?? "",
            maxLength: 12,
            oninput: (e: Event) => {
              L.text = (e.target as HTMLInputElement).value;
              refreshPreview();
            },
          }),
        ]),
        slider("Размер", 4, 60, 1, () => L.size ?? 18, (v) => (L.size = v)),
        colorRow("Цвет", () => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "circle") {
      baseRows.push(slider("Радиус", 1, 50, 1, () => L.r ?? 18, (v) => (L.r = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "rect") {
      baseRows.push(
        slider("Ширина", 2, 100, 1, () => L.w ?? 40, (v) => (L.w = v)),
        slider("Высота", 2, 100, 1, () => L.h ?? 28, (v) => (L.h = v)),
        slider("Скругление", 0, 50, 1, () => L.rx ?? 6, (v) => (L.rx = v)),
        colorRow("Цвет", () => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "ellipse") {
      baseRows.push(slider("Ширина", 2, 100, 1, () => L.w ?? 46, (v) => (L.w = v)), slider("Высота", 2, 100, 1, () => L.h ?? 30, (v) => (L.h = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "star" || L.type === "heart") {
      baseRows.push(slider("Размер", 4, 100, 1, () => L.size ?? 40, (v) => (L.size = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    }

    const p = sampleLayerAt(L, time);
    const setPose = (patch: Partial<PoseFields>) => {
      upsertKey(L, { ...poseFields(sampleLayerAt(L, time)), ...patch });
      refreshPreview();
      drawTimeline();
    };
    const onKey = keyIndexAt(L, time) >= 0;

    const poseRows = [
      el("p", { class: "anim-section-title" }, `Кадр на ${round(time)}с ${onKey ? "· ключ" : ""}`),
      slider("Сдвиг →", -60, 60, 1, () => p.dx, (v) => setPose({ dx: v })),
      slider("Сдвиг ↓", -60, 60, 1, () => p.dy, (v) => setPose({ dy: v })),
      slider("Поворот", -360, 360, 1, () => p.rot, (v) => setPose({ rot: v })),
      slider("Масштаб", 0, 4, 0.05, () => p.scale, (v) => setPose({ scale: v })),
      slider("Прозрачность", 0, 1, 0.05, () => p.opacity, (v) => setPose({ opacity: v })),
      colorRow("Цвет в кадре", () => p.fill || L.fill, (v) => setPose({ fill: v })),
      el("div", { class: "anim-key-actions" }, [
        btn("anim-add-btn", onKey ? "Обновить ключ" : "＋ Ключ здесь", () => {
          upsertKey(L, poseFields(sampleLayerAt(L, time)));
          renderAll();
        }),
        onKey
          ? btn("anim-add-btn danger", "Удалить ключ", () => {
              deleteKeyAt(L);
              renderAll();
            })
          : null,
        L.keys.length ? el("span", { class: "anim-ctl-val" }, `${L.keys.length} ключей`) : null,
      ]),
    ];

    panelEl.append(...baseRows, ...poseRows);
  }

  function layerLabel(L: EditLayer) {
    if (L.type === "emoji") return L.emoji ?? "";
    if (L.type === "text") return `«${L.text || "текст"}»`;
    return CE_SHAPES.find((s) => s.id === L.type)?.label ?? L.type;
  }
  function renderLayers() {
    layerListEl.replaceChildren();
    if (!scene.layers.length) {
      layerListEl.appendChild(el("p", { class: "anim-hint" }, "Пусто. Добавьте фигуры ниже."));
      return;
    }
    scene.layers.forEach((L, i) => {
      const mini = (text: string, title: string, fn: () => void, disabled = false, danger = false) =>
        el(
          "button",
          {
            type: "button",
            class: `anim-layer-mini${danger ? " danger" : ""}`,
            title,
            "aria-label": title,
            disabled,
            onclick: (e: Event) => {
              e.stopPropagation();
              fn();
            },
          },
          text
        );
      layerListEl.appendChild(
        el("div", { class: `anim-layer-row ${i === selected ? "sel" : ""}`, onclick: () => selectLayer(i) }, [
          el("span", { class: "anim-layer-name" }, layerLabel(L)),
          el("span", { class: "anim-layer-anim" }, `${L.keys.length} ключей`),
          el("div", { class: "anim-layer-actions" }, [
            mini("↑", "Назад (ниже)", () => moveLayer(i, -1), i === 0),
            mini("↓", "Вперёд (выше)", () => moveLayer(i, 1), i === scene.layers.length - 1),
            mini("✕", "Удалить", () => removeLayer(i), false, true),
          ]),
        ])
      );
    });
  }

  function drawTimeline() {
    timelineEl.replaceChildren();
    const track = el("div", { class: "anim-track" });
    const L = sel();
    if (L) {
      for (const k of L.keys) {
        track.appendChild(el("span", { class: `anim-keydot ${Math.abs(k.t - time) <= keyEps() ? "sel" : ""}`, style: { left: `${(k.t / scene.loop) * 100}%` }, title: `${round(k.t)}с` }));
      }
    }
    const playhead = el("span", { class: "anim-playhead", style: { left: `${(time / scene.loop) * 100}%` } });
    track.appendChild(playhead);
    const seek = (clientX: number) => {
      const r = track.getBoundingClientRect();
      time = clampT(((clientX - r.left) / (r.width || 1)) * scene.loop);
      if (playing) stopPlay();
      timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
      playhead.style.left = `${(time / scene.loop) * 100}%`;
      track.querySelectorAll(".anim-keydot").forEach((dot, idx) => dot.classList.toggle("sel", !!L && Math.abs(L.keys[idx]!.t - time) <= keyEps()));
      refreshPreview();
      renderPanel();
    };
    let seeking = false;
    track.addEventListener("pointerdown", (e) => {
      seeking = true;
      track.setPointerCapture?.(e.pointerId);
      seek(e.clientX);
    });
    track.addEventListener("pointermove", (e) => {
      if (seeking) seek(e.clientX);
    });
    track.addEventListener("pointerup", (e) => {
      seeking = false;
      try {
        track.releasePointerCapture?.(e.pointerId);
      } catch {
        /* захвата уже нет */
      }
    });
    timelineEl.appendChild(track);
    timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
  }

  function playTick(ts: number) {
    if (!playing) return;
    if (!playStart) playStart = ts;
    time = ((ts - playStart) / 1000) % scene.loop;
    const ph = timelineEl.querySelector<HTMLElement>(".anim-playhead");
    if (ph) ph.style.left = `${(time / scene.loop) * 100}%`;
    timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
    raf = requestAnimationFrame(playTick);
  }
  function startPlay() {
    playing = true;
    playStart = 0;
    playBtn.textContent = "⏸";
    refreshPreview();
    raf = requestAnimationFrame(playTick);
  }
  function stopPlay() {
    playing = false;
    playBtn.textContent = "▶";
    cancelAnimationFrame(raf);
    refreshPreview();
    renderPanel();
  }

  const playBtn = btn("anim-play-btn", "▶", () => (playing ? stopPlay() : startPlay()), { title: "Играть/пауза", "aria-label": "Играть/пауза" });
  const autokeyBtn = btn(
    "anim-autokey on",
    "● Автоключ",
    () => {
      autokey = !autokey;
      autokeyBtn.classList.toggle("on", autokey);
    },
    { title: "Автоключ: запись при перемещении" }
  );

  const addBar = el(
    "div",
    { class: "anim-add-bar" },
    CE_SHAPES.map((s) => btn("anim-add-btn", s.label, () => addLayer(s.id)))
  );

  const bgOn = el("input", {
    type: "checkbox",
    checked: !!scene.bg,
    "aria-label": "Фон",
    onchange: (e: Event) => {
      scene.bg = (e.target as HTMLInputElement).checked ? scene.bg || "#111418" : null;
      renderAll();
    },
  });
  const bgPick = el("input", {
    type: "color",
    class: "anim-color-input",
    value: scene.bg || "#111418",
    oninput: (e: Event) => {
      scene.bg = (e.target as HTMLInputElement).value;
      refreshPreview();
    },
  });
  const sceneBar = el("div", { class: "anim-scene-bar" }, [
    slider("Длина, с", 1, 12, 0.5, () => scene.loop, (v) => {
      scene.loop = v;
      if (time > v) time = v;
      drawTimeline();
    }),
    el("label", { class: "anim-ctl anim-bg-ctl" }, [el("span", { class: "anim-ctl-label" }, "Фон"), bgOn, bgPick]),
  ]);

  function renderAll() {
    renderLayers();
    renderPanel();
    refreshPreview();
    drawTimeline();
    errorEl.textContent = error || "";
    errorEl.style.display = error ? "block" : "none";
  }

  const node = el("div", { class: "anim-editor" }, [
    el("div", { class: "anim-body" }, [
      el("div", { class: "anim-stage" }, [
        previewBox,
        el("p", { class: "anim-section-title" }, "Добавить"),
        addBar,
        el("div", { class: "anim-transport" }, [playBtn, autokeyBtn, timeLabel]),
        timelineEl,
        el("p", { class: "anim-tip" }, "Встаньте на момент времени и подвиньте фигуру на холсте — движение запишется ключом."),
        sceneBar,
      ]),
      el("div", { class: "anim-side" }, [el("p", { class: "anim-section-title" }, "Слои"), layerListEl, el("p", { class: "anim-section-title" }, "Свойства и кадр"), panelEl]),
    ]),
    errorEl,
  ]);

  renderAll();

  return {
    node,
    result() {
      const clean = sanitizeCustomScene(scene);
      if (!clean.layers.length) {
        error = "Добавьте хотя бы одну фигуру";
        renderAll();
        return null;
      }
      return clean;
    },
    destroy() {
      playing = false;
      cancelAnimationFrame(raf);
    },
  };
}
