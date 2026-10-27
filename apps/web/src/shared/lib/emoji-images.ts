// Эмодзи картинками, как public/js/lib/emojiImages.js (tweb wrapRichText → img.emoji):
// на любом устройстве смайлы выглядят одинаково, а не системным шрифтом.
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** encodeEmoji из tweb: кодовые точки через «-», без FE0F (если нет ZWJ), первая — минимум 4 знака. */
export function encodeEmoji(text: string) {
  const clean = text.includes("‍") ? text : text.replace(/️/g, "");
  const points = [...clean].map((c) => c.codePointAt(0)!.toString(16));
  if (points[0]?.length === 2) points[0] = `00${points[0]}`;
  return points.join("-");
}

function isEmoji(g: string) {
  if (!EMOJI_RE.test(g)) return false;
  // ©, ®, ™ и стрелки без FE0F — это текст, а не эмодзи.
  return !(g.length === 1 && g.codePointAt(0)! < 0x2300);
}

export const emojiImageUrl = (emoji: string) => `/img/emoji/${encodeEmoji(emoji)}.png`;

export type EmojiPart = { emoji: string } | string;

/** Текст кусками: строки и эмодзи; без эмодзи — null (рисовать как есть). */
export function splitEmoji(text: string): EmojiPart[] | null {
  if (!text || !segmenter || !EMOJI_RE.test(text)) return null;
  const out: EmojiPart[] = [];
  let buf = "";
  for (const { segment } of segmenter.segment(text)) {
    if (isEmoji(segment)) {
      if (buf) out.push(buf);
      buf = "";
      out.push({ emoji: segment });
    } else buf += segment;
  }
  if (buf) out.push(buf);
  return out.some((p) => typeof p !== "string") ? out : null;
}

/** При копировании картинки-эмодзи становятся символами (installEmojiImages). */
export function installEmojiCopy() {
  const onCopy = (e: ClipboardEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !e.clipboardData) return;
    const box = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
    if (!box.querySelector("img.emoji")) return;
    box.querySelectorAll<HTMLImageElement>("img.emoji").forEach((img) => img.replaceWith(img.alt));
    e.clipboardData.setData("text/plain", box.innerText ?? box.textContent);
    e.clipboardData.setData("text/html", box.innerHTML);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy);
  return () => document.removeEventListener("copy", onCopy);
}
