// Длинный текст — несколькими сообщениями, как splitLongText в public/js/views/chatView.js:
// режем по строке, иначе по пробелу, иначе ровно по пределу.
export const MAX_TEXT = 4096;

export function splitLongText(text: string, max = MAX_TEXT) {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    let cut = slice.lastIndexOf("\n");
    if (cut < max / 2) cut = slice.lastIndexOf(" ");
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}
