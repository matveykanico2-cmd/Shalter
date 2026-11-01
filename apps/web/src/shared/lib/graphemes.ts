/** Строка по видимым символам (графемам): смайл с модификатором или ZWJ-склейка — один символ. */
export function graphemes(text: string) {
  if (typeof Intl === "undefined" || !Intl.Segmenter) return [...text];
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
}

const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Один смайл (не буква и не цифра) — то, что сервер примет смайлом на аватарке. */
export const isSingleEmoji = (text: string) => {
  const list = graphemes(text.trim());
  return list.length === 1 && PICTOGRAPHIC_RE.test(list[0]!) && [...list[0]!].length <= 8;
};
