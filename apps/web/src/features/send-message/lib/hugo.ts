// Проверка текста Hugo — как public/js/lib/hugo.js: находки по порядку, без пересечений;
// исправить одну или все сразу (с конца, чтобы смещения не поехали).
import type { proofMatch } from "@shalter/shared/schemas/integrations";
import type { z } from "zod";

export type ProofMatch = z.infer<typeof proofMatch>;

/** Находки по возрастанию смещения; пересекающиеся с предыдущей — выбрасываем. */
export function cleanMatches(matches: readonly ProofMatch[]) {
  const out: ProofMatch[] = [];
  let end = -1;
  for (const m of [...matches].sort((a, b) => a.offset - b.offset)) {
    if (m.offset < end) continue;
    out.push(m);
    end = m.offset + m.length;
  }
  return out;
}

export function applyFix(text: string, match: ProofMatch, replacement: string) {
  return { text: text.slice(0, match.offset) + replacement + text.slice(match.offset + match.length), caret: match.offset + replacement.length };
}

export function applyAll(text: string, matches: readonly ProofMatch[]) {
  let out = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    const replacement = m.replacements[0];
    if (replacement === undefined) continue;
    out = out.slice(0, m.offset) + replacement + out.slice(m.offset + m.length);
  }
  return out;
}

export const fragment = (text: string, m: ProofMatch) => text.slice(m.offset, m.offset + m.length);
