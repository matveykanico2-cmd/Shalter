// Эмодзи картинками, как в tweb (wrapRichText → <img class="emoji" src="assets/img/emoji/…png">):
// на любом устройстве смайлы выглядят одинаково, а не системным шрифтом.
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const SKIP = "input, textarea, select, option, script, style, svg, canvas, [contenteditable=''], [contenteditable='true'], .no-emoji, .mono, code, pre, kbd";
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// encodeEmoji из tweb: кодовые точки через «-», без FE0F (если нет ZWJ), первая — минимум 4 знака.
export function encodeEmoji(text) {
  const clean = text.includes("‍") ? text : text.replace(/️/g, "");
  const points = [...clean].map((c) => c.codePointAt(0).toString(16));
  if (points.length && points[0].length === 2) points[0] = `00${points[0]}`;
  return points.join("-");
}

function isEmoji(g) {
  if (!EMOJI_RE.test(g)) return false;
  // ©, ®, ™ и стрелки без FE0F — это текст, а не эмодзи
  const cp = g.codePointAt(0);
  if (g.length === 1 && cp < 0x2300 && !g.includes("️")) return false;
  return true;
}

function imgFor(g) {
  const img = document.createElement("img");
  img.className = "emoji";
  img.alt = g;
  img.draggable = false;
  img.decoding = "async";
  img.loading = "lazy";
  img.src = `/img/emoji/${encodeEmoji(g)}.png`;
  // Нет картинки (не из набора tweb) — остаётся обычным текстом, без битой иконки.
  img.addEventListener(
    "error",
    () => {
      const span = document.createElement("span");
      span.className = "no-emoji";
      span.textContent = g;
      img.replaceWith(span);
    },
    { once: true }
  );
  return img;
}

function wrapTextNode(node) {
  const text = node.nodeValue;
  if (!text || !EMOJI_RE.test(text) || !segmenter) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const frag = document.createDocumentFragment();
  let buf = "";
  let changed = false;
  for (const { segment } of segmenter.segment(text)) {
    if (isEmoji(segment)) {
      if (buf) frag.append(buf);
      buf = "";
      frag.append(imgFor(segment));
      changed = true;
    } else buf += segment;
  }
  if (!changed) return;
  if (buf) frag.append(buf);
  node.replaceWith(frag);
}

export function emojify(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) return wrapTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest?.(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(wrapTextNode);
}

// Текст элемента с эмодзи: картинки превращаются обратно в символы.
export function textWithEmoji(node) {
  if (!node) return "";
  const copy = node.cloneNode(true);
  copy.querySelectorAll("img.emoji").forEach((img) => img.replaceWith(img.alt));
  return copy.textContent;
}

export function installEmojiImages() {
  if (!segmenter) return;
  emojify(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") wrapTextNode(r.target);
      else r.addedNodes.forEach((n) => emojify(n));
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // Картинки нет (редкий эмодзи) — возвращаем символ.
  document.addEventListener(
    "error",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement && t.classList.contains("emoji")) t.replaceWith(document.createTextNode(t.alt));
    },
    true
  );

  // При копировании картинки-эмодзи становятся символами.
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !e.clipboardData) return;
    const box = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
    if (!box.querySelector("img.emoji")) return;
    box.querySelectorAll("img.emoji").forEach((img) => img.replaceWith(img.alt));
    e.clipboardData.setData("text/plain", box.innerText ?? box.textContent);
    e.clipboardData.setData("text/html", box.innerHTML);
    e.preventDefault();
  });
}
