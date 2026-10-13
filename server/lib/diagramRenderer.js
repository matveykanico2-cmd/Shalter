// Поясняющие картинки (схемы, шаги, циклы, инфографика, сравнения, деревья) для
// Shalter AI. Нейросеть присылает только содержание — JSON-описание, а рисует их
// этот модуль по готовым шаблонам: ровная сетка, читаемый русский текст, стрелки в
// нужную сторону. Результат — SVG, который sharp переводит в PNG.
const W = 1200;
const FONT = "DejaVu Sans, Arial, sans-serif";
const PALETTE = [
  { fill: "#e3f2fd", stroke: "#64b5f6", ink: "#0d47a1" },
  { fill: "#e8f5e9", stroke: "#81c784", ink: "#1b5e20" },
  { fill: "#fff3e0", stroke: "#ffb74d", ink: "#e65100" },
  { fill: "#f3e5f5", stroke: "#ba68c8", ink: "#4a148c" },
  { fill: "#fce4ec", stroke: "#f06292", ink: "#880e4f" },
  { fill: "#e0f7fa", stroke: "#4dd0e1", ink: "#006064" },
  { fill: "#fffde7", stroke: "#fdd835", ink: "#795548" },
  { fill: "#ede7f6", stroke: "#9575cd", ink: "#311b92" },
];
const ACCENT = { fill: "#4f6df5", stroke: "#3b55d9", ink: "#ffffff" };

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

// Перенос по словам под ширину блока (ширина символа ≈ 0.56 кегля).
function wrap(text, maxWidth, size, maxLines = 6, bold = false) {
  const perLine = Math.max(4, Math.floor(maxWidth / (size * (bold ? 0.66 : 0.56))));
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= perLine) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
    while (line.length > perLine) {
      lines.push(line.slice(0, perLine - 1) + "-");
      line = line.slice(perLine - 1);
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
  }
  return lines;
}

function textBlock(lines, x, y, size, color, { weight = 400, anchor = "middle", lh = 1.25 } = {}) {
  return lines
    .map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(l)}</text>`)
    .join("");
}

// Блок с заголовком и пояснением; возвращает svg и высоту.
function boxContent(item, w, colors, { titleSize = 26, noteSize = 19 } = {}) {
  const title = wrap(item.label, w - 36, titleSize, 3, true);
  const note = item.note ? wrap(item.note, w - 32, noteSize, 5) : [];
  const h = 28 + title.length * titleSize * 1.25 + (note.length ? 10 + note.length * noteSize * 1.3 : 0) + 18;
  return { title, note, h: Math.max(h, 84), colors, titleSize, noteSize };
}

function drawBox(x, y, w, c) {
  const { title, note, h, colors, titleSize, noteSize } = c;
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="3"/>`;
  const cx = x + w / 2;
  let ty = y + 26 + titleSize * 0.9;
  out += textBlock(title, cx, ty, titleSize, colors.ink, { weight: 700 });
  if (note.length) out += textBlock(note, cx, ty + title.length * titleSize * 1.25 + 4, noteSize, "#37474f", { lh: 1.3 });
  return out;
}

const DEFS = `<defs><marker id="ar" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M1 1 L11 6 L1 11 z" fill="#546e7a"/></marker>
<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.12"/></filter></defs>`;

function arrow(x1, y1, x2, y2, label) {
  let out = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#546e7a" stroke-width="3.5" marker-end="url(#ar)"/>`;
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const lines = wrap(label, 200, 17, 2);
    const bw = Math.max(...lines.map((l) => l.length)) * 17 * 0.58 + 18;
    const bh = lines.length * 21 + 10;
    out += `<rect x="${mx - bw / 2}" y="${my - bh / 2}" width="${bw}" height="${bh}" rx="10" fill="#ffffff" stroke="#cfd8dc"/>`;
    out += textBlock(lines, mx, my - bh / 2 + 22, 17, "#455a64");
  }
  return out;
}

function frame(title, subtitle, body, height, footer) {
  const t = wrap(title, W - 120, 46, 2, true);
  const sub = subtitle ? wrap(subtitle, W - 160, 22, 2) : [];
  const head = textBlock(t, W / 2, 70, 46, "#1f2937", { weight: 700 }) + (sub.length ? textBlock(sub, W / 2, 70 + t.length * 56 + 6, 22, "#607d8b") : "");
  const headH = 70 + t.length * 56 + (sub.length ? sub.length * 28 + 10 : 0);
  const foot = footer ? wrap(footer, W - 160, 22, 3) : [];
  const footH = foot.length ? foot.length * 30 + 50 : 30;
  const total = headH + height + footH;
  const footSvg = foot.length
    ? `<rect x="80" y="${headH + height + 10}" width="${W - 160}" height="${foot.length * 30 + 24}" rx="16" fill="#f1f5f9"/>` +
      textBlock(foot, W / 2, headH + height + 42, 22, "#334155")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}">${DEFS}
<rect width="${W}" height="${total}" fill="#fafbff"/><rect x="0" y="0" width="${W}" height="10" fill="${ACCENT.fill}"/>
${head}<g transform="translate(0 ${headH})">${body}</g>${footSvg}</svg>`;
}

const items = (arr, n = 8) => (Array.isArray(arr) ? arr : []).slice(0, n).map((x) => (typeof x === "string" ? { label: clip(x, 80) } : { label: clip(x?.label ?? x?.title ?? x?.name, 80), note: clip(x?.note ?? x?.text ?? x?.description, 160), arrow: clip(x?.arrow, 40) })).filter((x) => x.label);

// вход → центр → выход
function layoutProcess(spec) {
  const inputs = items(spec.inputs, 5);
  const outputs = items(spec.outputs, 5);
  const center = { label: clip(spec.center ?? spec.title, 60), note: clip(spec.centerNote, 160) };
  const colW = 300;
  const cW = 340;
  const xL = 40;
  const xC = (W - cW) / 2;
  const xR = W - 40 - colW;
  const col = (list, x, offset) => {
    const boxes = list.map((it, i) => boxContent(it, colW, PALETTE[(i + offset) % PALETTE.length]));
    const total = boxes.reduce((s, b) => s + b.h, 0) + Math.max(0, boxes.length - 1) * 28;
    return { boxes, total, x };
  };
  const L = col(inputs, xL, 0);
  const R = col(outputs, xR, 3);
  const C = boxContent(center, cW, ACCENT, { titleSize: 32, noteSize: 20 });
  C.note = C.note;
  const H = Math.max(L.total, R.total, C.h) + 40;
  let out = "";
  const cy = 20 + (H - 40 - C.h) / 2;
  out += `<g filter="url(#sh)">${drawBox(xC, cy, cW, { ...C, colors: ACCENT })}</g>`;
  // текст пояснения в акцентном блоке — белым
  out = out.replace(/fill="#37474f"/g, 'fill="#e8ecff"');
  const place = (colObj, toCenter) => {
    let y = 20 + (H - 40 - colObj.total) / 2;
    let s = "";
    colObj.boxes.forEach((b, i) => {
      s += `<g filter="url(#sh)">${drawBox(colObj.x, y, colW, b)}</g>`;
      const by = y + b.h / 2;
      const item = (toCenter ? inputs : outputs)[i];
      s += toCenter ? arrow(colObj.x + colW + 6, by, xC - 10, cy + C.h / 2, item.arrow) : arrow(xC + cW + 6, cy + C.h / 2, colObj.x - 10, by, item.arrow);
      y += b.h + 28;
    });
    return s;
  };
  out += place(L, true) + place(R, false);
  if (inputs.length) out += textBlock(["Что нужно"], xL + colW / 2, 8, 20, "#90a4ae", { weight: 700 });
  if (outputs.length) out += textBlock(["Что получается"], xR + colW / 2, 8, 20, "#90a4ae", { weight: 700 });
  return { body: out, height: H };
}

// шаги 1 → 2 → 3 (сеткой по 3 в ряд)
function layoutSteps(spec) {
  const steps = items(spec.steps ?? spec.items, 9);
  const perRow = steps.length <= 4 ? Math.max(1, steps.length) : 3;
  const gap = 56;
  const bw = Math.min(340, (W - 80 - gap * (perRow - 1)) / perRow);
  const boxes = steps.map((s, i) => boxContent(s, bw, PALETTE[i % PALETTE.length]));
  const rows = [];
  for (let i = 0; i < boxes.length; i += perRow) rows.push(boxes.slice(i, i + perRow));
  let y = 30;
  let out = "";
  const rowW = (n) => n * bw + (n - 1) * gap;
  rows.forEach((row, r) => {
    const rh = Math.max(...row.map((b) => b.h));
    const x0 = (W - rowW(row.length)) / 2;
    row.forEach((b, i) => {
      const idx = r * perRow + i;
      const x = x0 + i * (bw + gap);
      out += `<g filter="url(#sh)">${drawBox(x, y, bw, { ...b, h: rh })}</g>`;
      out += `<circle cx="${x + 22}" cy="${y}" r="22" fill="${ACCENT.fill}"/>` + textBlock([String(idx + 1)], x + 22, y + 8, 22, "#fff", { weight: 700 });
      if (i < row.length - 1) out += arrow(x + bw + 6, y + rh / 2, x + bw + gap - 8, y + rh / 2, steps[idx].arrow);
    });
    if (r < rows.length - 1) {
      const lastX = x0 + (row.length - 1) * (bw + gap) + bw / 2;
      const nextX0 = (W - rowW(rows[r + 1].length)) / 2 + bw / 2;
      out += `<path d="M ${lastX} ${y + rh + 6} V ${y + rh + 30} H ${nextX0} V ${y + rh + gap - 8}" fill="none" stroke="#546e7a" stroke-width="3.5" marker-end="url(#ar)"/>`;
    }
    y += rh + gap;
  });
  return { body: out, height: y };
}

// цикл: блоки по кругу, стрелки по часовой
function layoutCycle(spec) {
  const steps = items(spec.steps ?? spec.items, 8);
  const n = steps.length || 1;
  const bw = n > 5 ? 230 : 270;
  const boxes = steps.map((s, i) => boxContent(s, bw, PALETTE[i % PALETTE.length], { titleSize: 23, noteSize: 17 }));
  const R = n > 5 ? 330 : 290;
  const cx = W / 2;
  const cy = R + 90;
  let out = "";
  if (spec.center) out += `<circle cx="${cx}" cy="${cy}" r="110" fill="${ACCENT.fill}" opacity="0.95"/>` + textBlock(wrap(spec.center, 180, 24, 3, true), cx, cy + 8 - (wrap(spec.center, 180, 24, 3, true).length - 1) * 15, 24, "#fff", { weight: 700 });
  const pos = boxes.map((b, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), b, a };
  });
  pos.forEach((p, i) => {
    const q = pos[(i + 1) % n];
    if (n > 1) {
      const a1 = p.a + 0.34;
      const a2 = q.a - 0.46 + (i === n - 1 ? 2 * Math.PI : 0);
      const r2 = R - 10;
      out += `<path d="M ${cx + r2 * Math.cos(a1)} ${cy + r2 * Math.sin(a1)} A ${r2} ${r2} 0 0 1 ${cx + r2 * Math.cos(a2)} ${cy + r2 * Math.sin(a2)}" fill="none" stroke="#90a4ae" stroke-width="4" marker-end="url(#ar)"/>`;
    }
  });
  pos.forEach((p, i) => {
    out += `<g filter="url(#sh)">${drawBox(p.x - bw / 2, p.y - p.b.h / 2, bw, p.b)}</g>`;
    out += `<circle cx="${p.x - bw / 2 + 20}" cy="${p.y - p.b.h / 2}" r="20" fill="${ACCENT.fill}"/>` + textBlock([String(i + 1)], p.x - bw / 2 + 20, p.y - p.b.h / 2 + 7, 20, "#fff", { weight: 700 });
  });
  return { body: out, height: cy + R + 120 };
}

// карточки-инфографика
function layoutList(spec) {
  const list = items(spec.items ?? spec.steps, 9);
  const perRow = list.length <= 4 ? 2 : 3;
  const gap = 30;
  const bw = (W - 80 - gap * (perRow - 1)) / perRow;
  const boxes = list.map((s, i) => boxContent(s, bw, PALETTE[i % PALETTE.length]));
  let y = 20;
  let out = "";
  for (let i = 0; i < boxes.length; i += perRow) {
    const row = boxes.slice(i, i + perRow);
    const rh = Math.max(...row.map((b) => b.h));
    row.forEach((b, j) => {
      const x = 40 + j * (bw + gap);
      out += `<g filter="url(#sh)">${drawBox(x, y, bw, { ...b, h: rh })}</g>`;
      out += `<rect x="${x}" y="${y}" width="10" height="${rh}" rx="5" fill="${b.colors.stroke}"/>`;
    });
    y += rh + gap;
  }
  return { body: out, height: y };
}

// сравнение колонками
function layoutCompare(spec) {
  const cols = (Array.isArray(spec.columns) ? spec.columns : [])
    .slice(0, 4)
    .map((c) => ({
      title: clip(c?.title ?? c?.label, 50),
      items: (Array.isArray(c?.items) ? c.items : []).slice(0, 8).map((x) => clip(typeof x === "string" ? x : x?.label, 120)).filter(Boolean),
    }))
    .filter((c) => c.title);
  const n = cols.length || 1;
  const gap = 26;
  const bw = (W - 80 - gap * (n - 1)) / n;
  const built = cols.map((c, i) => {
    const color = PALETTE[(i * 2) % PALETTE.length];
    const x = 40 + i * (bw + gap);
    const head = wrap(c.title, bw - 30, 28, 2, true);
    const headH = 30 + head.length * 35;
    let y = 20 + headH + 18;
    let body = "";
    for (const it of c.items) {
      const lines = wrap(it, bw - 60, 20, 4);
      body += `<circle cx="${x + 26}" cy="${y + 14}" r="6" fill="${color.stroke}"/>` + textBlock(lines, x + 42, y + 21, 20, "#37474f", { anchor: "start", lh: 1.3 });
      y += lines.length * 26 + 16;
    }
    return { x, color, head, headH, body, h: y - 20 + 4 };
  });
  const maxH = Math.max(120, ...built.map((c) => c.h));
  let out = "";
  for (const c of built) {
    out += `<g filter="url(#sh)"><rect x="${c.x}" y="20" width="${bw}" height="${maxH}" rx="20" fill="#ffffff" stroke="${c.color.stroke}" stroke-width="3"/></g>`;
    out += `<path d="M ${c.x} ${20 + c.headH} V 40 a 20 20 0 0 1 20 -20 H ${c.x + bw - 20} a 20 20 0 0 1 20 20 V ${20 + c.headH} Z" fill="${c.color.fill}"/>`;
    out += textBlock(c.head, c.x + bw / 2, 20 + 44, 28, c.color.ink, { weight: 700 });
    out += c.body;
  }
  return { body: out, height: maxH + 40 };
}

// дерево: корень → ветви → листья
function layoutTree(spec) {
  const root = clip(spec.root ?? spec.center ?? spec.title, 60);
  const branches = (Array.isArray(spec.children ?? spec.items) ? spec.children ?? spec.items : []).slice(0, 5).map((b) => ({
    label: clip(typeof b === "string" ? b : b?.label, 60),
    children: (Array.isArray(b?.children) ? b.children : []).slice(0, 5).map((x) => clip(typeof x === "string" ? x : x?.label, 70)).filter(Boolean),
  })).filter((b) => b.label);
  const n = branches.length || 1;
  const gap = 22;
  const bw = (W - 80 - gap * (n - 1)) / n;
  const rootBox = boxContent({ label: root }, 420, ACCENT, { titleSize: 30 });
  let out = `<g filter="url(#sh)">${drawBox((W - 420) / 2, 20, 420, rootBox)}</g>`;
  const by = 20 + rootBox.h + 70;
  let maxY = by;
  branches.forEach((b, i) => {
    const x = 40 + i * (bw + gap);
    const color = PALETTE[i % PALETTE.length];
    const box = boxContent({ label: b.label }, bw, color, { titleSize: 24 });
    out += `<path d="M ${W / 2} ${20 + rootBox.h + 4} C ${W / 2} ${by - 30}, ${x + bw / 2} ${by - 40}, ${x + bw / 2} ${by - 8}" fill="none" stroke="#90a4ae" stroke-width="3.5" marker-end="url(#ar)"/>`;
    out += `<g filter="url(#sh)">${drawBox(x, by, bw, box)}</g>`;
    let y = by + box.h + 18;
    for (const leaf of b.children) {
      const lines = wrap(leaf, bw - 30, 19, 3);
      const h = lines.length * 25 + 20;
      out += `<line x1="${x + bw / 2}" y1="${y - 18}" x2="${x + bw / 2}" y2="${y}" stroke="${color.stroke}" stroke-width="2.5"/>`;
      out += `<rect x="${x + 8}" y="${y}" width="${bw - 16}" height="${h}" rx="12" fill="#ffffff" stroke="${color.stroke}" stroke-width="2"/>` + textBlock(lines, x + bw / 2, y + 28, 19, "#37474f");
      y += h + 18;
    }
    maxY = Math.max(maxY, y);
  });
  return { body: out, height: maxY + 10 };
}

const LAYOUTS = { process: layoutProcess, steps: layoutSteps, cycle: layoutCycle, list: layoutList, compare: layoutCompare, tree: layoutTree };

function renderDiagramSvg(spec) {
  if (!spec || typeof spec !== "object") return null;
  const type = LAYOUTS[spec.type] ? spec.type : spec.inputs || spec.outputs ? "process" : spec.columns ? "compare" : spec.children ? "tree" : spec.steps ? "steps" : "list";
  const { body, height } = LAYOUTS[type](spec);
  if (!body || height < 40) return null;
  return frame(clip(spec.title, 90) || "Схема", clip(spec.subtitle, 160), body, height, clip(spec.footer, 240));
}

// JSON из ответа модели: без ```, лишнего текста и висячих запятых.
function parseSpec(text) {
  const raw = String(text ?? "").replace(/```(?:json)?/gi, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const body = raw.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

const SPEC_PROMPT =
  "Ты готовишь содержание поясняющей картинки (схема, шаги, цикл, инфографика, сравнение или дерево). " +
  "Ответь ТОЛЬКО JSON без пояснений. Выбери type по смыслу:\n" +
  '• "process" — что входит и что получается: {"type":"process","title":"…","center":"…","centerNote":"…","inputs":[{"label":"…","note":"…","arrow":"…"}],"outputs":[…],"footer":"формула или итог"}\n' +
  '• "steps" — последовательность: {"type":"steps","title":"…","steps":[{"label":"…","note":"…"}],"footer":"…"}\n' +
  '• "cycle" — круговорот: {"type":"cycle","title":"…","center":"…","steps":[{"label":"…","note":"…"}]}\n' +
  '• "list" — факты/карточки: {"type":"list","title":"…","items":[{"label":"…","note":"…"}]}\n' +
  '• "compare" — сравнение: {"type":"compare","title":"…","columns":[{"title":"…","items":["…"]}]}\n' +
  '• "tree" — классификация: {"type":"tree","title":"…","root":"…","children":[{"label":"…","children":["…"]}]}\n' +
  "Правила: всё по-русски; label — 1–4 слова, note — короткое точное пояснение до 12 слов; 3–7 элементов; " +
  "факты строго верные (проверь формулы и названия); arrow — подпись стрелки (1–2 слова) или пусто.";

module.exports = { renderDiagramSvg, parseSpec, SPEC_PROMPT };
