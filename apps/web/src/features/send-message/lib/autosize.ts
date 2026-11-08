/**
 * Высота поля ввода по тексту без «height: auto» на самом поле: меряем скрытой копией.
 * Сброс высоты у живого textarea схлопывал его на кадр, и iOS Safari заново прокручивал
 * страницу к курсору — экран мигал на каждом символе.
 */
const COPIED = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "wordSpacing",
  "wordBreak",
  "overflowWrap",
  "whiteSpace",
  "tabSize",
] as const;

let mirror: HTMLTextAreaElement | null = null;

function getMirror(): HTMLTextAreaElement {
  if (mirror?.isConnected) return mirror;
  const el = document.createElement("textarea");
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.readOnly = true;
  Object.assign(el.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    visibility: "hidden",
    pointerEvents: "none",
    height: "0",
    minHeight: "0",
    maxHeight: "none",
    overflow: "hidden",
    zIndex: "-1",
  });
  document.body.appendChild(el);
  mirror = el;
  return el;
}

/** Нужная полю высота в px (не больше max). */
export function measureTextarea(el: HTMLTextAreaElement, max: number): number {
  const copy = getMirror();
  const cs = getComputedStyle(el);
  for (const key of COPIED) copy.style[key] = cs[key];
  copy.value = el.value;
  let height = copy.scrollHeight;
  if (cs.boxSizing === "border-box") height += (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  return Math.min(height, max);
}

/**
 * Подогнать высоту: стиль меняем, только если она другая. Текст влез целиком — показываем его с
 * начала (после поворота экрана поле оставалось прокрученным к концу); не влез — курсор в конце
 * остаётся виден.
 */
export function fitTextarea(el: HTMLTextAreaElement, max: number): void {
  const height = measureTextarea(el, max);
  const next = `${height}px`;
  if (el.style.height !== next) el.style.height = next;
  const overflow = height >= max ? "auto" : "hidden";
  if (el.style.overflowY !== overflow) el.style.overflowY = overflow;
  if (overflow === "hidden") {
    if (el.scrollTop !== 0) el.scrollTop = 0;
  } else if (document.activeElement === el && el.selectionEnd === el.value.length) {
    el.scrollTop = el.scrollHeight;
    // На Android WebView/Safari прокрутка textarea сбрасывается после layout текущего кадра.
    // Повторяем после отрисовки, иначе при 7+ строках курсор остаётся снизу, а видна верхушка.
    requestAnimationFrame(() => {
      if (el.isConnected && document.activeElement === el && el.selectionEnd === el.value.length) el.scrollTop = el.scrollHeight;
    });
  }
}
