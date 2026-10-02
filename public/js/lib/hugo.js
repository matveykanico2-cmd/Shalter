import { api } from "../api.js";

export async function checkText(text) {
  const { matches, language } = await api.hugoCheck(text);
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

export function applyFix(text, match, replacement) {
  const before = text.slice(0, match.offset);
  const after = text.slice(match.offset + match.length);
  return { text: before + replacement + after, caret: match.offset + replacement.length };
}

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

export function fragment(text, match) {
  return text.slice(match.offset, match.offset + match.length);
}
