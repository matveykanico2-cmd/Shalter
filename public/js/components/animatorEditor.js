import { el, clear } from "../lib/dom.js";
import {
  CE_ANIMS,
  CE_SHAPES,
  CE_MAX_LAYERS,
  renderCustomScene,
  sanitizeCustomScene,
  blankScene,
} from "../lib/customScene.js";

// Аниматор — редактор пользовательских сцен. Одним диалогом создаются стикеры,
// кастомные эмодзи и подарки: разница только в подписи и в том, кто вызвал
// (см. onSave). Сцена — это слои фигур/эмодзи, у каждого своё движение из
// словаря CE_ANIMS; рендер и модель — lib/customScene.js.
//
// Перерисовка: живой предпросмотр и панель слоя обновляются точечно. Ползунки
// двигают сцену и перерисовывают только предпросмотр (иначе на каждом пикселе
// пересобиралась бы вся панель и слетал бы фокус); список слоёв и панель
// пересобираются лишь когда меняется структура (добавили/удалили/выбрали слой).

const EMOJI_QUICK = ["😀", "😍", "🎉", "🔥", "❤️", "⭐", "✨", "🎁", "🌹", "🐱", "👍", "💎"];
const COLOR_SWATCHES = ["#ff8a3d", "#ff5d73", "#ffd23f", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#ffffff", "#2f2a24"];

// Готовый слой по типу — с осмысленными значениями по умолчанию, чтобы новый
// слой сразу был виден в центре, а не нулевой точкой.
function defaultLayer(type) {
  const base = { type, x: 50, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, anim: "none", delay: 0, dur: 1.6 };
  if (type === "emoji") return { ...base, emoji: "😀", size: 44 };
  if (type === "text") return { ...base, text: "текст", size: 18, fill: "#2f2a24" };
  if (type === "circle") return { ...base, r: 18 };
  if (type === "rect") return { ...base, w: 40, h: 28, rx: 6 };
  if (type === "ellipse") return { ...base, w: 46, h: 30 };
  if (type === "star") return { ...base, size: 40, fill: "#ffd23f" };
  if (type === "heart") return { ...base, size: 38, fill: "#ff5d73" };
  return base;
}

export function openAnimatorEditor({ title = "Аниматор", saveLabel = "Сохранить", initial = null, onSave } = {}) {
  const scene = initial ? sanitizeCustomScene(initial) : blankScene();
  let selected = scene.layers.length ? 0 : -1;
  let error = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  // Живой предпросмотр — крупная сцена, играющая в цикле.
  const previewBox = el("div", { class: "anim-preview" });
  function refreshPreview() {
    clear(previewBox);
    previewBox.appendChild(renderCustomScene(scene, { size: 200, replay: false }));
  }

  const layerListEl = el("div", { class: "anim-layers" });
  const panelEl = el("div", { class: "anim-panel" });
  const errorEl = el("p", { class: "anim-error" });

  function selectLayer(i) {
    selected = i;
    renderAll();
  }
  function addLayer(type) {
    if (scene.layers.length >= CE_MAX_LAYERS) {
      error = `Не больше ${CE_MAX_LAYERS} фигур`;
      renderAll();
      return;
    }
    error = null;
    scene.layers.push(defaultLayer(type));
    selected = scene.layers.length - 1;
    renderAll();
  }
  function removeLayer(i) {
    scene.layers.splice(i, 1);
    if (selected >= scene.layers.length) selected = scene.layers.length - 1;
    renderAll();
  }
  function moveLayer(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= scene.layers.length) return;
    const [item] = scene.layers.splice(i, 1);
    scene.layers.splice(j, 0, item);
    selected = j;
    renderAll();
  }

  // ── Мелкие строители контролов ─────────────────────────────────────────────

  // Ползунок с живой подписью значения; двигает сцену и перерисовывает только
  // предпросмотр — без пересборки панели.
  function slider(label, min, max, step, get, set) {
    const val = el("span", { class: "anim-ctl-val" }, String(round(get())));
    const input = el("input", {
      type: "range",
      min,
      max,
      step,
      value: get(),
      oninput: (e) => {
        set(Number(e.target.value));
        val.textContent = String(round(Number(e.target.value)));
        refreshPreview();
      },
    });
    return el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, [label, val]), input]);
  }

  function colorRow(get, set) {
    const swatches = COLOR_SWATCHES.map((c) =>
      el("button", {
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
    const picker = el("input", {
      type: "color",
      class: "anim-color-input",
      value: /^#[0-9a-f]{6}$/i.test(get()) ? get() : "#ff8a3d",
      oninput: (e) => {
        set(e.target.value);
        refreshPreview();
      },
    });
    return el("div", { class: "anim-ctl" }, [
      el("span", { class: "anim-ctl-label" }, "Цвет"),
      el("div", { class: "anim-swatches" }, [...swatches, picker]),
    ]);
  }

  function animSelect(get, set) {
    return el("label", { class: "anim-ctl" }, [
      el("span", { class: "anim-ctl-label" }, "Движение"),
      el(
        "select",
        {
          class: "anim-select",
          onchange: (e) => {
            set(e.target.value);
            refreshPreview();
          },
        },
        CE_ANIMS.map((a) => el("option", { value: a.id, selected: get() === a.id }, a.label))
      ),
    ]);
  }

  // ── Панель выбранного слоя ──────────────────────────────────────────────────

  function renderPanel() {
    clear(panelEl);
    if (selected < 0 || !scene.layers[selected]) {
      panelEl.appendChild(el("p", { class: "anim-hint" }, "Добавьте фигуру или эмодзи, чтобы начать."));
      return;
    }
    const L = scene.layers[selected];
    const rows = [];

    if (L.type === "emoji") {
      const quick = el(
        "div",
        { class: "anim-emoji-quick" },
        EMOJI_QUICK.map((e) =>
          el("button", { class: "anim-emoji-btn", onclick: () => { L.emoji = e; renderPanel(); refreshPreview(); } }, e)
        )
      );
      rows.push(
        el("label", { class: "anim-ctl" }, [
          el("span", { class: "anim-ctl-label" }, "Эмодзи"),
          el("input", {
            type: "text",
            class: "anim-text-input",
            value: L.emoji,
            maxLength: 8,
            oninput: (e) => { L.emoji = e.target.value; refreshPreview(); },
          }),
        ]),
        quick,
        slider("Размер", 6, 100, 1, () => L.size, (v) => (L.size = v))
      );
    } else if (L.type === "text") {
      rows.push(
        el("label", { class: "anim-ctl" }, [
          el("span", { class: "anim-ctl-label" }, "Текст"),
          el("input", {
            type: "text",
            class: "anim-text-input",
            value: L.text,
            maxLength: 12,
            oninput: (e) => { L.text = e.target.value; refreshPreview(); },
          }),
        ]),
        slider("Размер", 4, 60, 1, () => L.size, (v) => (L.size = v)),
        colorRow(() => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "circle") {
      rows.push(slider("Радиус", 1, 50, 1, () => L.r, (v) => (L.r = v)), colorRow(() => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "rect") {
      rows.push(
        slider("Ширина", 2, 100, 1, () => L.w, (v) => (L.w = v)),
        slider("Высота", 2, 100, 1, () => L.h, (v) => (L.h = v)),
        slider("Скругление", 0, 50, 1, () => L.rx, (v) => (L.rx = v)),
        colorRow(() => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "ellipse") {
      rows.push(
        slider("Ширина", 2, 100, 1, () => L.w, (v) => (L.w = v)),
        slider("Высота", 2, 100, 1, () => L.h, (v) => (L.h = v)),
        colorRow(() => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "star" || L.type === "heart") {
      rows.push(slider("Размер", 4, 100, 1, () => L.size, (v) => (L.size = v)), colorRow(() => L.fill, (v) => (L.fill = v)));
    }

    // Общие для всех слоёв: положение, поворот, прозрачность, движение.
    rows.push(
      slider("По горизонтали", 0, 100, 1, () => L.x, (v) => (L.x = v)),
      slider("По вертикали", 0, 100, 1, () => L.y, (v) => (L.y = v)),
      slider("Поворот", -180, 180, 1, () => L.rot, (v) => (L.rot = v)),
      slider("Прозрачность", 0, 1, 0.05, () => L.opacity, (v) => (L.opacity = v)),
      animSelect(() => L.anim, (v) => (L.anim = v))
    );
    if (L.anim !== "none") {
      rows.push(
        slider("Длительность, с", 0.3, 8, 0.1, () => L.dur, (v) => (L.dur = v)),
        slider("Задержка, с", 0, 8, 0.1, () => L.delay, (v) => (L.delay = v))
      );
    }
    panelEl.append(...rows);
  }

  // ── Список слоёв ────────────────────────────────────────────────────────────

  function layerLabel(L) {
    if (L.type === "emoji") return L.emoji;
    if (L.type === "text") return `«${L.text || "текст"}»`;
    return CE_SHAPES.find((s) => s.id === L.type)?.label ?? L.type;
  }

  function renderLayers() {
    clear(layerListEl);
    if (!scene.layers.length) {
      layerListEl.appendChild(el("p", { class: "anim-hint" }, "Пусто. Добавьте фигуры ниже."));
      return;
    }
    scene.layers.forEach((L, i) => {
      layerListEl.appendChild(
        el("div", { class: `anim-layer-row ${i === selected ? "sel" : ""}`, onclick: () => selectLayer(i) }, [
          el("span", { class: "anim-layer-name" }, layerLabel(L)),
          el("span", { class: "anim-layer-anim" }, CE_ANIMS.find((a) => a.id === L.anim)?.label ?? ""),
          el("div", { class: "anim-layer-actions" }, [
            el("button", { class: "anim-layer-mini", title: "Выше", onclick: (e) => { e.stopPropagation(); moveLayer(i, -1); } }, "↑"),
            el("button", { class: "anim-layer-mini", title: "Ниже", onclick: (e) => { e.stopPropagation(); moveLayer(i, 1); } }, "↓"),
            el("button", { class: "anim-layer-mini danger", title: "Удалить", onclick: (e) => { e.stopPropagation(); removeLayer(i); } }, "✕"),
          ]),
        ])
      );
    });
  }

  function renderAll() {
    renderLayers();
    renderPanel();
    refreshPreview();
    errorEl.textContent = error || "";
    errorEl.style.display = error ? "block" : "none";
  }

  // ── Сборка диалога ───────────────────────────────────────────────────────────

  const addBar = el(
    "div",
    { class: "anim-add-bar" },
    CE_SHAPES.map((s) => el("button", { class: "anim-add-btn", onclick: () => addLayer(s.id) }, s.label))
  );

  const sceneBar = el("div", { class: "anim-scene-bar" }, [
    slider("Длина цикла, с", 1, 12, 0.5, () => scene.loop, (v) => (scene.loop = v)),
    (() => {
      const on = el("input", {
        type: "checkbox",
        checked: !!scene.bg,
        onchange: (e) => { scene.bg = e.target.checked ? scene.bg || "#111418" : null; renderAll(); },
      });
      const pick = el("input", {
        type: "color",
        class: "anim-color-input",
        value: scene.bg || "#111418",
        oninput: (e) => { scene.bg = e.target.value; refreshPreview(); },
      });
      return el("label", { class: "anim-ctl anim-bg-ctl" }, [el("span", { class: "anim-ctl-label" }, "Фон"), on, pick]);
    })(),
  ]);

  function save() {
    const clean = sanitizeCustomScene(scene);
    if (!clean.layers.length) {
      error = "Добавьте хотя бы одну фигуру";
      renderAll();
      return;
    }
    onSave?.(clean);
    close();
  }

  const dialog = el("div", { class: "modal-dialog anim-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    el("div", { class: "anim-body" }, [
      el("div", { class: "anim-stage" }, [previewBox, sceneBar]),
      el("div", { class: "anim-side" }, [
        el("p", { class: "anim-section-title" }, "Слои"),
        layerListEl,
        addBar,
        el("p", { class: "anim-section-title" }, "Свойства"),
        panelEl,
      ]),
    ]),
    errorEl,
    el("div", { class: "anim-actions" }, [
      el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
      el("button", { class: "anim-save-btn", onclick: save }, saveLabel),
    ]),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  renderAll();
}

function round(n) {
  return Math.round(n * 100) / 100;
}
