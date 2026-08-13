import { api } from "../api.js";

// Client half of "Hugo", the composer's writing checker (server/routes/hugo.js).
//
// Applying a fix is offset arithmetic, not string replacement: LanguageTool
// returns each problem as {offset, length, replacements}, and replacing by text
// would hit the wrong occurrence whenever the same word appears twice ("а он
// сказал что он..."). Applying by offset also means fixing several problems in
// one pass has to walk the list backwards, so each edit can't shift the offsets
// of the ones still to come.

export async function checkText(text) {
  const { matches, language } = await api.hugoCheck(text);
  // Sorted and de-overlapped: two rules occasionally flag overlapping spans, and
  // applying both would corrupt the text.
  const sorted = (matches ?? []).slice().sort((a, b) => a.offset - b.offset);
  const clean = [];
  let end = -1;
  for (const m of sorted) {
    if (m.offset < end) continue;
    clean.push(m);
    end = m.offset + m.length;
  }
  return { matches: clean, language };
}

// Replaces one match's span with the chosen replacement, returning the new text
// and the caret position just after the change.
export function applyFix(text, match, replacement) {
  const before = text.slice(0, match.offset);
  const after = text.slice(match.offset + match.length);
  return { text: before + replacement + after, caret: match.offset + replacement.length };
}

// Applies the first suggestion of every match that has one. Walks backwards so
// earlier offsets stay valid as later spans change length.
export function applyAll(text, matches) {
  let out = text;
  let applied = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const replacement = m.replacements?.[0];
    if (replacement === undefined) continue;
    out = out.slice(0, m.offset) + replacement + out.slice(m.offset + m.length);
    applied++;
  }
  return { text: out, applied };
}

// The exact fragment a match points at, for showing "малоко → молоко" instead of
// LanguageTool's prose description alone.
export function fragment(text, match) {
  return text.slice(match.offset, match.offset + match.length);
}
