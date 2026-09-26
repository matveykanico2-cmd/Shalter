import { el, clear } from "../lib/dom.js";
import {
  CE_SHAPES,
  CE_MAX_LAYERS,
  CE_MAX_KEYS,
  renderCustomScene,
  sanitizeCustomScene,
  sampleLayerAt,
  blankScene,
} from "../lib/customScene.js";
import { ALL_EMOJI } from "../lib/emojiList.js";

// Аниматор — покадровый редактор 2D-анимаций («блендер для 2D»).
//
// Здесь не выбирают готовое движение из списка — его собирают сами: ставят
// фигуру/эмодзи, встают на момент времени, двигают её (перетаскиванием на
// холсте или ползунками) — и это записывается ключом. Между ключами браузер
// сам плавно интерполирует (Web Animations API, см. lib/customScene.js). Так
// анимируется что угодно — 🍾, нога персонажа, меняющийся по времени цвет.
//
// Модель: сцена = слои. У слоя есть «база» (форма, размер, цвет, положение) и
// набор ключей во времени — поз относительно базы (смещение, поворот, масштаб,
// прозрачность, необязательно цвет). Одним редактором создаются стикеры,
// эмодзи и подарки — разница лишь в подписи и в том, кто вызвал (onSave).

const COLOR_SWATCHES =["#ff8a3d", "#ff5d73", "#ffd23f", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6", "#ffffff", "#2f2a24"];
const PREVIEW = 240;

function defaultLayer(type) {
  const base = { type, x: 50, y: 50, fill: "#ff8a3d", opacity: 1, rot: 0, keys: [] };
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
  for (const l of scene.layers) if (!Array.isArray(l.keys)) l.keys = [];
  let selected = scene.layers.length ? 0 : -1;
  let time = 0; // текущий момент таймлайна, сек
  let playing = false;
  let autokey = true; // перетаскивание/ползунки пишут ключ в текущий момент
  let error = null;
  let raf = 0;
  let playStart = 0;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });

  const previewBox = el("div", { class: "anim-preview" });
  const layerListEl = el("div", { class: "anim-layers" });
  const panelEl = el("div", { class: "anim-panel" });
  const errorEl = el("p", { class: "anim-error" });
  const timelineEl = el("div", { class: "anim-timeline" });
  const timeLabel = el("span", { class: "anim-time-label" });

  const sel = () => (selected >= 0 ? scene.layers[selected] : null);
  const clampT = (t) => Math.min(scene.loop, Math.max(0, Math.round(t * 100) / 100));

  // ── Предпросмотр ─────────────────────────────────────────────────────────

  function refreshPreview() {
    clear(previewBox);
    // На паузе замораживаем сцену на текущем моменте; при проигрывании отдаём
    // WAAPI (atTime не задаём).
    const svg = renderCustomScene(scene, { size: PREVIEW, atTime: playing ? null : time });
    // Маркер выбранного слоя — кольцо в его текущем положении, чтобы видеть, что
    // именно двигаешь. При проигрывании прячем (поза меняется сама).
    const L = sel();
    if (L && !playing) {
      const p = sampleLayerAt(L, time);
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", L.x + p.dx);
      ring.setAttribute("cy", L.y + p.dy);
      ring.setAttribute("r", "6");
      ring.setAttribute("class", "anim-marker");
      svg.appendChild(ring);
    }
    previewBox.appendChild(svg);
  }

  // Экранные координаты → координаты вьюбокса 0..100. Берём прямоугольник
  // самого <svg> (он центрирован в контейнере и может быть меньше него).
  function toViewbox(clientX, clientY) {
    const svg = previewBox.querySelector("svg");
    const r = (svg || previewBox).getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    };
  }

  // Перетаскивание выбранного слоя прямо на холсте.
  let dragging = false;
  previewBox.addEventListener("pointerdown", (e) => {
    const L = sel();
    if (!L || playing) return;
    dragging = true;
    previewBox.setPointerCapture(e.pointerId);
    moveTo(e.clientX, e.clientY);
  });
  previewBox.addEventListener("pointermove", (e) => dragging && moveTo(e.clientX, e.clientY));
  previewBox.addEventListener("pointerup", (e) => {
    dragging = false;
    try { previewBox.releasePointerCapture(e.pointerId); } catch {}
  });

  function moveTo(clientX, clientY) {
    const L = sel();
    if (!L) return;
    const v = toViewbox(clientX, clientY);
    if (autokey) {
      // Записываем позу: смещение от базы так, чтобы фигура оказалась под курсором.
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

  // ── Ключи ────────────────────────────────────────────────────────────────

  function poseFields(p) {
    const o = { dx: p.dx, dy: p.dy, rot: p.rot, scale: p.scale, opacity: p.opacity };
    if (p.fill) o.fill = p.fill;
    return o;
  }
  const keyEps = () => Math.max(0.03, scene.loop * 0.01);
  function keyIndexAt(L, t) {
    const eps = keyEps();
    return L.keys.findIndex((k) => Math.abs(k.t - t) <= eps);
  }
  function upsertKey(L, pose) {
    if (L.keys.length >= CE_MAX_KEYS && keyIndexAt(L, time) < 0) {
      error = `Не больше ${CE_MAX_KEYS} ключей на слой`;
      renderAll();
      return;
    }
    error = null;
    const i = keyIndexAt(L, time);
    const rec = { t: i >= 0 ? L.keys[i].t : clampT(time), dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1, ...pose };
    if (i >= 0) L.keys[i] = rec;
    else {
      L.keys.push(rec);
      L.keys.sort((a, b) => a.t - b.t);
    }
  }
  function deleteKeyAt(L) {
    const i = keyIndexAt(L, time);
    if (i >= 0) L.keys.splice(i, 1);
  }

  // ── Слои ───────────────────────────────────────────────────────────────────

  function selectLayer(i) { selected = i; renderAll(); }
  function addLayer(type) {
    if (scene.layers.length >= CE_MAX_LAYERS) { error = `Не больше ${CE_MAX_LAYERS} фигур`; renderAll(); return; }
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

  // ── Контролы ────────────────────────────────────────────────────────────────

  function slider(label, min, max, step, get, set) {
    const val = el("span", { class: "anim-ctl-val" }, String(round(get())));
    const input = el("input", {
      type: "range", min, max, step, value: get(),
      oninput: (e) => { set(Number(e.target.value)); val.textContent = String(round(Number(e.target.value))); refreshPreview(); },
    });
    return el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, [label, val]), input]);
  }

  function colorRow(label, get, set) {
    const swatches = COLOR_SWATCHES.map((c) =>
      el("button", { class: `anim-swatch ${get() === c ? "sel" : ""}`, style: { background: c }, title: c, onclick: () => { set(c); renderPanel(); refreshPreview(); } })
    );
    const picker = el("input", { type: "color", class: "anim-color-input", value: /^#[0-9a-f]{6}$/i.test(get() || "") ? get() : "#ff8a3d", oninput: (e) => { set(e.target.value); refreshPreview(); } });
    return el("div", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, label), el("div", { class: "anim-swatches" }, [...swatches, picker])]);
  }

  // ── Панель выбранного слоя ──────────────────────────────────────────────────

  function renderPanel() {
    clear(panelEl);
    const L = sel();
    if (!L) { panelEl.appendChild(el("p", { class: "anim-hint" }, "Добавьте фигуру или эмодзи, чтобы начать.")); return; }

    // Базовые свойства фигуры (форма/размер/цвет).
    const baseRows = [];
    if (L.type === "emoji") {
      const emojiInput = el("input", { type: "text", class: "anim-text-input", value: L.emoji, maxLength: 8, oninput: (e) => { L.emoji = e.target.value; refreshPreview(); } });
      // Полная сетка эмодзи (lib/emojiList.js) — «все эмодзи». Выбор не
      // пересобирает панель (чтобы прокрутка не прыгала): только меняет слой,
      // поле ввода и предпросмотр.
      const grid = el(
        "div",
        { class: "anim-emoji-grid" },
        ALL_EMOJI.map((e) =>
          el("button", { class: "anim-emoji-btn", type: "button", onclick: () => { L.emoji = e; emojiInput.value = e; refreshPreview(); } }, e)
        )
      );
      baseRows.push(
        el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, "Эмодзи"), emojiInput]),
        grid,
        slider("Размер", 6, 100, 1, () => L.size, (v) => (L.size = v))
      );
    } else if (L.type === "text") {
      baseRows.push(
        el("label", { class: "anim-ctl" }, [el("span", { class: "anim-ctl-label" }, "Текст"), el("input", { type: "text", class: "anim-text-input", value: L.text, maxLength: 12, oninput: (e) => { L.text = e.target.value; refreshPreview(); } })]),
        slider("Размер", 4, 60, 1, () => L.size, (v) => (L.size = v)),
        colorRow("Цвет", () => L.fill, (v) => (L.fill = v))
      );
    } else if (L.type === "circle") {
      baseRows.push(slider("Радиус", 1, 50, 1, () => L.r, (v) => (L.r = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "rect") {
      baseRows.push(slider("Ширина", 2, 100, 1, () => L.w, (v) => (L.w = v)), slider("Высота", 2, 100, 1, () => L.h, (v) => (L.h = v)), slider("Скругление", 0, 50, 1, () => L.rx, (v) => (L.rx = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "ellipse") {
      baseRows.push(slider("Ширина", 2, 100, 1, () => L.w, (v) => (L.w = v)), slider("Высота", 2, 100, 1, () => L.h, (v) => (L.h = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    } else if (L.type === "star" || L.type === "heart") {
      baseRows.push(slider("Размер", 4, 100, 1, () => L.size, (v) => (L.size = v)), colorRow("Цвет", () => L.fill, (v) => (L.fill = v)));
    }

    // Поза в текущем ключе. Ползунки редактируют позу на позиции таймлайна:
    // меняешь — ставится/обновляется ключ в этот момент.
    const p = sampleLayerAt(L, time);
    // Позу читаем заново на каждое изменение (а не из захваченного p): иначе
    // правка одного поля затёрла бы значения, выставленные другими ползунками.
    const setPose = (patch) => { upsertKey(L, { ...poseFields(sampleLayerAt(L, time)), ...patch }); refreshPreview(); drawTimeline(); };
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
        el("button", { class: "anim-add-btn", onclick: () => { upsertKey(L, poseFields(sampleLayerAt(L, time))); renderAll(); } }, onKey ? "Обновить ключ" : "＋ Ключ здесь"),
        onKey ? el("button", { class: "anim-add-btn danger", onclick: () => { deleteKeyAt(L); renderAll(); } }, "Удалить ключ") : null,
        L.keys.length ? el("span", { class: "anim-ctl-val" }, `${L.keys.length} ключей`) : null,
      ]),
    ];

    panelEl.append(...baseRows, ...poseRows);
  }

  // ── Список слоёв ────────────────────────────────────────────────────────────

  function layerLabel(L) {
    if (L.type === "emoji") return L.emoji;
    if (L.type === "text") return `«${L.text || "текст"}»`;
    return CE_SHAPES.find((s) => s.id === L.type)?.label ?? L.type;
  }
  function renderLayers() {
    clear(layerListEl);
    if (!scene.layers.length) { layerListEl.appendChild(el("p", { class: "anim-hint" }, "Пусто. Добавьте фигуры ниже.")); return; }
    scene.layers.forEach((L, i) => {
      layerListEl.appendChild(
        el("div", { class: `anim-layer-row ${i === selected ? "sel" : ""}`, onclick: () => selectLayer(i) }, [
          el("span", { class: "anim-layer-name" }, layerLabel(L)),
          el("span", { class: "anim-layer-anim" }, `${L.keys.length} ключей`),
          el("div", { class: "anim-layer-actions" }, [
            el("button", { class: "anim-layer-mini danger", title: "Удалить", onclick: (e) => { e.stopPropagation(); removeLayer(i); } }, "✕"),
          ]),
        ])
      );
    });
  }

  // ── Таймлайн ─────────────────────────────────────────────────────────────────

  function drawTimeline() {
    clear(timelineEl);
    const track = el("div", { class: "anim-track" });
    const L = sel();
    if (L) {
      for (const k of L.keys) {
        track.appendChild(el("span", { class: `anim-keydot ${Math.abs(k.t - time) <= keyEps() ? "sel" : ""}`, style: { left: `${(k.t / scene.loop) * 100}%` }, title: `${round(k.t)}с` }));
      }
    }
    const playhead = el("span", { class: "anim-playhead", style: { left: `${(time / scene.loop) * 100}%` } });
    track.appendChild(playhead);
    // Во время перетаскивания НЕ пересобираем таймлайн (иначе оторвётся
    // pointer-capture с текущего трека) — двигаем плейхед и подсветку на месте.
    const seek = (clientX) => {
      const r = track.getBoundingClientRect();
      time = clampT(((clientX - r.left) / r.width) * scene.loop);
      if (playing) stopPlay();
      timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
      playhead.style.left = `${(time / scene.loop) * 100}%`;
      track.querySelectorAll(".anim-keydot").forEach((dot, idx) => dot.classList.toggle("sel", L && Math.abs(L.keys[idx].t - time) <= keyEps()));
      refreshPreview();
      renderPanel();
    };
    let seeking = false;
    track.addEventListener("pointerdown", (e) => { seeking = true; track.setPointerCapture(e.pointerId); seek(e.clientX); });
    track.addEventListener("pointermove", (e) => seeking && seek(e.clientX));
    track.addEventListener("pointerup", (e) => { seeking = false; try { track.releasePointerCapture(e.pointerId); } catch {} });
    timelineEl.appendChild(track);
    timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
  }

  function playTick(ts) {
    if (!playing) return;
    if (!playStart) playStart = ts;
    time = ((ts - playStart) / 1000) % scene.loop;
    playheadFollow();
    raf = requestAnimationFrame(playTick);
  }
  function playheadFollow() {
    const ph = timelineEl.querySelector(".anim-playhead");
    if (ph) ph.style.left = `${(time / scene.loop) * 100}%`;
    timeLabel.textContent = `${round(time)} / ${round(scene.loop)}с`;
  }
  function startPlay() {
    playing = true;
    playStart = 0;
    playBtn.textContent = "⏸";
    refreshPreview(); // WAAPI-проигрывание
    raf = requestAnimationFrame(playTick);
  }
  function stopPlay() {
    playing = false;
    playBtn.textContent = "▶";
    cancelAnimationFrame(raf);
    refreshPreview();
    renderPanel();
  }

  // ── Сборка ────────────────────────────────────────────────────────────────

  const playBtn = el("button", { class: "anim-play-btn", title: "Играть/пауза", onclick: () => (playing ? stopPlay() : startPlay()) }, "▶");
  const autokeyBtn = el("button", { class: `anim-autokey ${autokey ? "on" : ""}`, title: "Автоключ: запись при перемещении", onclick: () => { autokey = !autokey; autokeyBtn.classList.toggle("on", autokey); } }, "● Автоключ");

  const addBar = el("div", { class: "anim-add-bar" }, CE_SHAPES.map((s) => el("button", { class: "anim-add-btn", onclick: () => addLayer(s.id) }, s.label)));

  const sceneBar = el("div", { class: "anim-scene-bar" }, [
    slider("Длина, с", 1, 12, 0.5, () => scene.loop, (v) => { scene.loop = v; if (time > v) time = v; drawTimeline(); }),
    (() => {
      const on = el("input", { type: "checkbox", checked: !!scene.bg, onchange: (e) => { scene.bg = e.target.checked ? scene.bg || "#111418" : null; renderAll(); } });
      const pick = el("input", { type: "color", class: "anim-color-input", value: scene.bg || "#111418", oninput: (e) => { scene.bg = e.target.value; refreshPreview(); } });
      return el("label", { class: "anim-ctl anim-bg-ctl" }, [el("span", { class: "anim-ctl-label" }, "Фон"), on, pick]);
    })(),
  ]);

  function renderAll() {
    renderLayers();
    renderPanel();
    refreshPreview();
    drawTimeline();
    errorEl.textContent = error || "";
    errorEl.style.display = error ? "block" : "none";
  }

  function save() {
    const clean = sanitizeCustomScene(scene);
    if (!clean.layers.length) { error = "Добавьте хотя бы одну фигуру"; renderAll(); return; }
    onSave?.(clean);
    close();
  }

  const dialog = el("div", { class: "modal-dialog anim-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    el("div", { class: "anim-body" }, [
      el("div", { class: "anim-stage" }, [
        previewBox,
        el("div", { class: "anim-transport" }, [playBtn, autokeyBtn, timeLabel]),
        timelineEl,
        el("p", { class: "anim-tip" }, "Встаньте на момент времени и подвиньте фигуру на холсте — движение запишется ключом."),
        sceneBar,
      ]),
      el("div", { class: "anim-side" }, [
        el("p", { class: "anim-section-title" }, "Слои"),
        layerListEl,
        addBar,
        el("p", { class: "anim-section-title" }, "Свойства и кадр"),
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
    cancelAnimationFrame(raf);
    overlay.remove();
  }

  renderAll();
}

function round(n) {
  return Math.round(n * 100) / 100;
}
