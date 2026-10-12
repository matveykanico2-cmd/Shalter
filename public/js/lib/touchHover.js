// Телефоны (iPhone особенно): после касания :hover «залипает» — строка чата остаётся
// подсвеченной, у сообщения висят кнопки действий, пока не коснёшься чего-то ещё.
// На устройствах без мыши убираем из своих стилей селекторы с :hover — так это
// работает и для правил, которые появятся потом, без обёрток @media (hover) в каждом.

// Делим список селекторов по запятым верхнего уровня (не внутри :is(), :not() и т. п.).
function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function stripHover(list) {
  for (let i = list.cssRules.length - 1; i >= 0; i--) {
    const rule = list.cssRules[i];
    if (rule.cssRules && !(rule instanceof CSSStyleRule)) {
      stripHover(rule);
      continue;
    }
    if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(":hover")) continue;
    const kept = splitSelectors(rule.selectorText).filter((s) => !s.includes(":hover"));
    if (kept.length) rule.selectorText = kept.join(", ");
    else list.deleteRule(i);
  }
}

function processSheet(sheet) {
  try {
    if (sheet.href && new URL(sheet.href).origin !== location.origin) return;
    stripHover(sheet);
  } catch {
    // Таблица ещё не загрузилась или чужая — пропускаем.
  }
}

export function installTouchHover() {
  if (!window.matchMedia?.("(hover: none)").matches) return;
  for (const sheet of document.styleSheets) processSheet(sheet);
  // Стили, подключённые позже (ленивые экраны), — тоже.
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (!link.sheet) link.addEventListener("load", () => processSheet(link.sheet), { once: true });
  }
}
