// Translates the app's own interface (button labels, menu items, settings
// text, placeholders...) through the same free Google Translate endpoint as
// the per-message "Перевести" action (server/routes/translate.js) — not a
// hand-maintained locale file per language, a live pass over the rendered
// DOM. That's a deliberate tradeoff: works for literally any language
// Google Translate supports with zero translation files to write/maintain,
// at the cost of being best-effort rather than pixel-perfect (same tradeoff
// a browser's own "Translate this page" makes).
//
// Why this is safe to run repeatedly: this app's views re-render by fully
// replacing DOM subtrees (see lib/dom.js's mount()/clear() — nothing here
// diffs or patches in place), so every mutation this module observes is
// freshly created markup containing the *original* Russian source text,
// never previously-translated text. There is no risk of double-translating
// already-translated content — the localStorage cache below just makes the
// (very common) repeat of the same recurring label instant instead of a new
// network round trip.

import { api } from "../api.js";

const CACHE_KEY = "shalter_ui_translation_cache_v1";
const MIN_TEXT_LEN = 1;
const HAS_LETTER = /[a-zа-яёàâäéèêëïîôöùûüçñ]/i;

// Anything user-authored or otherwise not a fixed UI label — never translate
// inside these (message content, names, phone numbers, tokens/codes...).
const SKIP_SELECTOR = [
  ".message-list",
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
  ".mono",
].join(",");

let cache = {}; // { [lang]: { [originalText]: translatedText } }
let translatedValues = new Set(); // every value currently in cache[currentLang] — see translateVisible
let observer = null;
let currentLang = "ru";
let pending = false;
const OBSERVER_OPTIONS = { childList: true, subtree: true, characterData: true };

function loadCache() {
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    cache = {};
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable (private browsing etc.) — translation still
    // works for the session, it just re-fetches next time instead of caching.
  }
}

function isTranslatable(text) {
  const t = text.trim();
  return t.length >= MIN_TEXT_LEN && HAS_LETTER.test(t);
}

function isSkipped(el) {
  return !!el?.closest?.(SKIP_SELECTOR);
}

// Collects {node, text} for text nodes and {el, attr, text} for
// placeholder/title attributes, anywhere under `root` that isn't inside a
// skipped container.
function collect(root) {
  const items = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.nodeValue;
      if (!isTranslatable(text)) return NodeFilter.FILTER_REJECT;
      if (isSkipped(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  while ((node = walker.nextNode())) items.push({ kind: "text", node, text: node.nodeValue });

  root.querySelectorAll?.("[placeholder], [title]").forEach((el) => {
    if (isSkipped(el)) return;
    if (el.placeholder && isTranslatable(el.placeholder)) items.push({ kind: "placeholder", el, text: el.placeholder });
    if (el.title && isTranslatable(el.title)) items.push({ kind: "title", el, text: el.title });
  });
  if (root.placeholder && isTranslatable(root.placeholder) && !isSkipped(root)) {
    items.push({ kind: "placeholder", el: root, text: root.placeholder });
  }

  return items;
}

function apply(item, translated) {
  if (!translated || translated === item.text) return;
  if (item.kind === "text") {
    if (!item.node.isConnected) return; // view moved on before the translation came back
    item.node.nodeValue = translated;
  } else if (item.kind === "placeholder") {
    item.el.placeholder = translated;
  } else if (item.kind === "title") {
    item.el.title = translated;
  }
}

let rerunRequested = false;

async function translateVisible(root) {
  if (currentLang === "ru") return;
  // A mutation arriving while a batch is already in flight (very common: a
  // view's own async settings fetch resolving and mounting its real content
  // a beat after the surrounding shell already rendered) must not just be
  // dropped — that content would never get translated at all, since nothing
  // re-triggers it later. Queue one catch-up pass instead.
  if (pending) {
    rerunRequested = true;
    return;
  }
  pending = true;
  try {
    const items = collect(root);
    const known = cache[currentLang] ?? (cache[currentLang] = {});

    // Writing a translation is itself a mutation inside the observed
    // subtree, which is *why the observer must never be disconnected*: an
    // earlier version disconnected it around the apply step, and any
    // genuinely new content that happened to mount during that exact window
    // (e.g. a view's own async data arriving) was permanently missed —
    // MutationObserver doesn't retroactively report mutations from while it
    // was disconnected. Instead, recognize our own writes by their *value*:
    // if a collected node's text already exactly matches something we
    // ourselves produced as a translation, it's our own prior output being
    // re-observed, not new source text — skip it, don't re-translate it.
    const toFetch = [...new Set(items.filter((i) => !(i.text in known) && !translatedValues.has(i.text)).map((i) => i.text))];

    if (toFetch.length > 0) {
      // Cap per pass — a huge one-off batch (e.g. first paint of a very
      // text-heavy page) still gets translated, just over a couple of
      // passes instead of one giant request.
      const batch = toFetch.slice(0, 150);
      const { translations } = await api.translateBatch(batch, currentLang);
      batch.forEach((text, i) => {
        known[text] = translations[i] ?? text;
        translatedValues.add(known[text]);
      });
      saveCache();
    }

    for (const item of items) apply(item, known[item.text]);
  } catch (err) {
    console.error("UI translation pass failed:", err);
  } finally {
    pending = false;
    if (rerunRequested) {
      rerunRequested = false;
      translateVisible(root);
    }
  }
}

let debounceTimer = null;
function scheduleTranslate(root) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => translateVisible(root), 200);
}

// Called once at app boot (see app.js) with the user's uiLanguage setting.
// Re-running with a new language after a settings change is handled by
// reloading the page (see settings/index.js) rather than live-retargeting —
// simpler and avoids any half-old-half-new-language flicker.
export function initUiTranslation(lang) {
  currentLang = lang || "ru";
  if (currentLang === "ru") return; // nothing to do — that's the authored language

  loadCache();
  translatedValues = new Set(Object.values(cache[currentLang] ?? {}));
  const root = document.getElementById("view-root");
  translateVisible(root);

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => scheduleTranslate(root));
  observer.observe(root, OBSERVER_OPTIONS);
}
