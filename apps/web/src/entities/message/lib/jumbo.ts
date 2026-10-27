// Сообщение из 1–3 эмодзи — крупно (jumboEmojiCount в messageBubble.js).
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const FLAG_RE = /^\p{Regional_Indicator}{2}$/u;

const isEmojiGrapheme = (g: string) => EXTENDED_PICTOGRAPHIC_RE.test(g) || FLAG_RE.test(g);

export function graphemes(text: string) {
  if (typeof Intl === "undefined" || !Intl.Segmenter) return [...text];
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
}

/** 0 — обычный текст, 1–3 — столько эмодзи, ничего больше. */
export function jumboEmojiCount(text: string | null | undefined) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return 0;
  const list = graphemes(trimmed);
  if (list.length > 3) return 0;
  return list.every(isEmojiGrapheme) ? list.length : 0;
}

/** Текст только из своих эмодзи ([ce:N] через пробелы) — их номера. */
export function customEmojiOnly(text: string | null | undefined) {
  if (!/^\s*(\[ce:\d+\]\s*)+$/.test(text ?? "")) return null;
  return [...(text ?? "").matchAll(/\[ce:(\d+)\]/g)].map((m) => Number(m[1]));
}
