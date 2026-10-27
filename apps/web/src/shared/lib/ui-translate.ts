// Перевод интерфейса на язык из настроек (uiLanguage), как public/js/lib/uiTranslate.js:
// MutationObserver подменяет русские надписи переводом из POST /api/translate/batch, переводы
// копятся в localStorage. Исходный язык интерфейса — русский, поэтому переводим только строки
// с кириллицей: латиница — имена, юзернеймы, бренды и код.
import { http } from "../api";

// v3: ключи без пробелов по краям — общий кэш со старым клиентом.
const CACHE_KEY = "shalter_ui_translation_cache_v3";
const HAS_LETTER = /[а-яё]/i;
const ATTRS = ["placeholder", "title", "aria-label"];
const BATCH_SIZE = 300;

// Пользовательский контент не переводим: лента сообщений целиком (role="log"), поля ввода и
// всё, что помечено translate="no" (имена, названия чатов) или data-no-translate.
const SKIP_SELECTOR = ['[role="log"]', '[translate="no"]', "[data-no-translate]", "[contenteditable]", "textarea", "input", "script", "style"].join(",");

type Item = { kind: "text"; node: Text; text: string } | { kind: string; el: Element; text: string };

let known: Record<string, string> = {};
let cache: Record<string, Record<string, string>> = {};
let translatedValues = new Set<string>();
const failed = new Set<string>();
const waiting = new Map<string, Item[]>();
let observer: MutationObserver | null = null;
let lang = "ru";
let fetchTimer: ReturnType<typeof setTimeout> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let fetching = false;
let retryDelay = 0;

function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Хранилище переполнено или недоступно — переведём заново в следующий раз.
    }
  }, 500);
}

const isTranslatable = (text: string | null): text is string => !!text && HAS_LETTER.test(text) && !translatedValues.has(text.trim());
const isSkipped = (el: Element | null) => !!el?.closest(SKIP_SELECTOR);

function applyText(node: Text, translated: string) {
  const value = node.nodeValue ?? "";
  const next = (value.match(/^\s*/)?.[0] ?? "") + translated + (value.match(/\s*$/)?.[0] ?? "");
  if (value !== next) node.nodeValue = next;
}

function apply(item: Item, translated: string) {
  if (item.kind === "text" && "node" in item) applyText(item.node, translated);
  else if ("el" in item) item.el.setAttribute(item.kind, translated);
}

function handle(item: Item) {
  const key = item.text.trim();
  const translated = known[key];
  if (translated) return apply(item, translated);
  if (failed.has(key)) return;
  const list = waiting.get(key);
  if (list) list.push(item);
  else waiting.set(key, [item]);
}

function scanAttrs(el: Element) {
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (isTranslatable(v)) handle({ kind: attr, el, text: v });
  }
}

function scan(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (isTranslatable(root.nodeValue) && !isSkipped(root.parentElement)) handle({ kind: "text", node: root as Text, text: root.nodeValue });
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || isSkipped(root as Element)) return;
  scanAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).matches(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return isTranslatable(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) handle({ kind: "text", node: node as Text, text: node.nodeValue ?? "" });
    else if ((node as Element).attributes.length) scanAttrs(node as Element);
  }
}

function scheduleFetch() {
  if (!waiting.size || fetching) return;
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(() => void fetchWaiting(), 30);
}

async function fetchWaiting() {
  if (fetching || !waiting.size) return;
  fetching = true;
  const batch = [...waiting.keys()].slice(0, BATCH_SIZE);
  try {
    const { translations } = await http.post<{ translations: (string | null)[] }>("/api/translate/batch", { texts: batch, target: lang });
    batch.forEach((text, i) => {
      const items = waiting.get(text) ?? [];
      waiting.delete(text);
      const translated = translations[i];
      // Не кэшируем неудачу: повторим после перезагрузки.
      if (!translated) return void failed.add(text);
      known[text] = translated;
      translatedValues.add(translated);
      for (const item of items) {
        // Пока шёл запрос, надпись могла смениться — переводим только тот же текст.
        if ("node" in item ? item.node.isConnected && item.node.nodeValue === item.text : item.el.getAttribute(item.kind) === item.text) apply(item, translated);
      }
    });
    saveCache();
  } catch {
    // Сбой сети или переводчика — строки остаются в очереди, повторяем с нарастающей паузой.
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 2000, 60_000);
    fetching = false;
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => void fetchWaiting(), retryDelay);
    return;
  }
  retryDelay = 0;
  fetching = false;
  scheduleFetch();
}

function onMutations(mutations: MutationRecord[]) {
  for (const m of mutations) {
    if (m.type === "childList") m.addedNodes.forEach(scan);
    else if (m.type === "characterData") scan(m.target);
    else if (m.type === "attributes" && m.attributeName && !isSkipped(m.target as Element)) {
      const v = (m.target as Element).getAttribute(m.attributeName);
      if (isTranslatable(v)) handle({ kind: m.attributeName, el: m.target as Element, text: v });
    }
  }
  scheduleFetch();
}

/** Включить перевод интерфейса; "ru" (или пусто) — выключить. */
export function initUiTranslation(language: string | undefined) {
  lang = language || "ru";
  observer?.disconnect();
  observer = null;
  if (lang === "ru") return;
  document.documentElement.lang = lang;
  try {
    cache = (JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as typeof cache | null) ?? {};
  } catch {
    cache = {};
  }
  known = cache[lang] ??= {};
  translatedValues = new Set(Object.values(known));
  // Вся страница: окна, меню и тосты живут прямо в <body>. Наблюдатель срабатывает до
  // отрисовки, поэтому известные строки подменяются без мигания русского текста.
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  scan(document.body);
  scheduleFetch();
}
