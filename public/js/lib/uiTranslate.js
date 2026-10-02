import { api } from "../api.js";

// v3: ключи теперь без пробелов по краям.
const CACHE_KEY = "shalter_ui_translation_cache_v3";
// The UI's source language is Russian, so only Cyrillic strings are ours to
// translate. Latin ones are names, usernames, brands or code, and Google
// mangles them when told they're Russian.
const HAS_LETTER = /[а-яё]/i;
const ATTRS = ["placeholder", "title", "aria-label"];
const BATCH_SIZE = 300;

// Пользовательский контент не переводим. Внутри ленты сообщений переводим
// только служебные надписи (разделители дат, «X сменил фото» и т.п.).
const SKIP_SELECTOR = [
  ".message-list .sender-name",
  ".pinned-bar-slot",
  ".chat-list-item-title",
  ".chat-list-item-preview",
  ".chat-header-title",
  ".chat-header-subtitle",
  ".contact-row-name",
  ".contact-row-status",
  ".contact-candidate-name",
  ".contact-candidate-username",
  ".profile-name",
  ".profile-username",
  ".profile-bio",
  ".profile-field-row",
  ".profile-status",
  ".settings-profile-name",
  ".settings-profile-sub",
  ".settings-device-body",
  ".settings-account-name",
  ".settings-account-sub",
  ".info-panel-title",
  ".info-panel-member-name",
  ".sender-name",
  ".referral-code-value",
  ".bot-token-value",
  ".avatar-fallback",
  ".mono",
  ".message-translation",
  "[contenteditable]",
  "textarea",
  "script",
  "style",
  "[data-no-translate]",
].join(",");
const MESSAGE_LIST_ALLOW = ".system-message, .date-divider, .bubble-actions";

let cache = {};
let known = {};
let translatedValues = new Set();
const failedThisSession = new Set();
let observer = null;
let currentLang = "ru";

// Строки, которых ещё нет в кэше: текст → элементы, ждущие перевода.
const waiting = new Map();
let fetchTimer = null;
let fetching = false;

function loadCache() {
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    cache = {};
  }
}

let saveTimer = null;
function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
    }
  }, 500);
}

function isTranslatable(text) {
  return !!text && HAS_LETTER.test(text) && !translatedValues.has(text.trim());
}

// Жёсткий пропуск — всё поддерево целиком.
function isHardSkipped(el) {
  return !!el?.closest?.(SKIP_SELECTOR);
}

// В ленте сообщений переводим только служебные надписи.
function isSkipped(el) {
  if (!el?.closest) return false;
  if (isHardSkipped(el)) return true;
  return !!el.closest(".message-list") && !el.closest(MESSAGE_LIST_ALLOW);
}

function applyText(node, translated) {
  const value = node.nodeValue;
  const lead = value.match(/^\s*/)[0];
  const trail = value.match(/\s*$/)[0];
  const next = lead + translated + trail;
  if (value !== next) node.nodeValue = next;
}

function handle(item) {
  const key = item.text.trim();
  const translated = known[key];
  if (translated) {
    if (item.kind === "text") applyText(item.node, translated);
    else item.el.setAttribute(item.kind, translated);
    return;
  }
  if (failedThisSession.has(key)) return;
  let list = waiting.get(key);
  if (!list) waiting.set(key, (list = []));
  list.push(item);
}

function scanAttrs(el) {
  for (const attr of ATTRS) {
    const v = el.getAttribute?.(attr);
    if (v && isTranslatable(v)) handle({ kind: attr, el, text: v });
  }
}

function scan(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (isTranslatable(root.nodeValue) && !isSkipped(root.parentElement)) handle({ kind: "text", node: root, text: root.nodeValue });
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || isHardSkipped(root)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return node.matches(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return isTranslatable(node.nodeValue) && !isSkipped(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  if (!isSkipped(root)) scanAttrs(root);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) handle({ kind: "text", node, text: node.nodeValue });
    else if (node.attributes.length && !isSkipped(node)) scanAttrs(node);
  }
}

function scheduleFetch() {
  if (!waiting.size || fetching) return;
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchWaiting, 30);
}

async function fetchWaiting() {
  if (fetching || !waiting.size) return;
  fetching = true;
  const batch = [...waiting.keys()].slice(0, BATCH_SIZE);
  try {
    const { translations } = await api.translateBatch(batch, currentLang);
    batch.forEach((text, i) => {
      const items = waiting.get(text) ?? [];
      waiting.delete(text);
      const translated = translations?.[i];
      if (!translated) return void failedThisSession.add(text); // не кэшируем: повторим после перезагрузки
      known[text] = translated;
      translatedValues.add(translated);
      for (const item of items) {
        // Элемент мог смениться, пока шёл запрос, — применяем только к тому же тексту.
        if (item.kind === "text") {
          if (item.node.isConnected && item.node.nodeValue === item.text) applyText(item.node, translated);
        } else if (item.el.getAttribute(item.kind) === item.text) {
          item.el.setAttribute(item.kind, translated);
        }
      }
    });
    saveCache();
  } catch (err) {
    console.error("UI translation pass failed:", err);
    for (const text of batch) {
      failedThisSession.add(text);
      waiting.delete(text);
    }
  } finally {
    fetching = false;
    scheduleFetch();
  }
}

function onMutations(mutations) {
  for (const m of mutations) {
    if (m.type === "childList") m.addedNodes.forEach(scan);
    else if (m.type === "characterData") scan(m.target);
    else if (m.type === "attributes" && !isSkipped(m.target)) {
      const v = m.target.getAttribute(m.attributeName);
      if (v && isTranslatable(v)) handle({ kind: m.attributeName, el: m.target, text: v });
    }
  }
  scheduleFetch();
}

export function initUiTranslation(lang) {
  currentLang = lang || "ru";
  if (currentLang === "ru") return;
  document.documentElement.lang = currentLang;

  loadCache();
  known = cache[currentLang] ?? (cache[currentLang] = {});
  translatedValues = new Set(Object.values(known));

  // Вся страница, а не только #view-root: диалоги, меню и тосты живут в <body>.
  // MutationObserver срабатывает до отрисовки, поэтому уже известные строки
  // подменяются без мигания русского текста.
  if (observer) observer.disconnect();
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  scan(document.body);
  scheduleFetch();
}
