import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { translateLocally } from "../lib/localTranslate.js";
import { openDropdownMenu } from "./dropdownMenu.js";

// Переводчик как в tweb (popups/translate): окно «Перевод» с карточкой —
// сверху свёрнутый оригинал «Перевод с …», под чертой «Перевод на <язык>»
// с кнопкой копирования, внизу кнопка OK. Язык выбирается прямо в заголовке.

export const TRANSLATE_LANGUAGES = [
  { id: "ru", label: "Русский", in: "русского", to: "русский" },
  { id: "en", label: "English", in: "английского", to: "английский" },
  { id: "es", label: "Español", in: "испанского", to: "испанский" },
  { id: "zh-CN", label: "中文", in: "китайского", to: "китайский" },
  { id: "hi", label: "हिन्दी", in: "хинди", to: "хинди" },
  { id: "ar", label: "العربية", in: "арабского", to: "арабский" },
  { id: "pt", label: "Português", in: "португальского", to: "португальский" },
  { id: "fr", label: "Français", in: "французского", to: "французский" },
  { id: "de", label: "Deutsch", in: "немецкого", to: "немецкий" },
  { id: "ja", label: "日本語", in: "японского", to: "японский" },
  { id: "ko", label: "한국어", in: "корейского", to: "корейский" },
  { id: "tr", label: "Türkçe", in: "турецкого", to: "турецкий" },
  { id: "it", label: "Italiano", in: "итальянского", to: "итальянский" },
  { id: "pl", label: "Polski", in: "польского", to: "польский" },
  { id: "uk", label: "Українська", in: "украинского", to: "украинский" },
  { id: "vi", label: "Tiếng Việt", in: "вьетнамского", to: "вьетнамский" },
  { id: "th", label: "ไทย", in: "тайского", to: "тайский" },
  { id: "id", label: "Bahasa Indonesia", in: "индонезийского", to: "индонезийский" },
  { id: "fa", label: "فارسی", in: "персидского", to: "персидский" },
  { id: "kk", label: "Қазақша", in: "казахского", to: "казахский" },
];
const langOf = (id) => TRANSLATE_LANGUAGES.find((l) => l.id === id || l.id.split("-")[0] === String(id ?? "").split("-")[0]);

const cache = new Map();
async function translate(text, lang) {
  const key = `${lang}\n${text}`;
  if (cache.has(key)) return cache.get(key);
  // Сначала сервер: встроенный переводчик Chrome путается на коротких и смешанных текстах.
  let result = await api
    .translateText(text, lang)
    .then((r) => ({ text: r.translated, detected: r.detectedLang ?? null }))
    .catch(() => null);
  if (!result?.text) {
    const local = await translateLocally(text, lang).catch(() => null);
    result = local ? { text: local, detected: null } : null;
  }
  if (!result?.text) throw new Error("no translation");
  cache.set(key, result);
  return result;
}

export function openTranslatePopup(text) {
  let lang = getState().settings?.translateLanguage || "ru";
  let detected = null;
  let expanded = false;
  let seq = 0;

  const overlay = el("div", { class: "modal-overlay tw-tr-overlay", onclick: (e) => e.target === overlay && close() });
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);

  const originalTitle = el("span", {}, "Перевод");
  const arrow = el("span", { class: "tw-tr-arrow", html: iconSvg("ChevronDown", 18) });
  const originalBody = el("div", { class: "tw-tr-original-text", dir: "auto" }, text);
  const original = el("div", { class: "tw-tr-original collapsed" }, [
    el("button", {
      type: "button",
      class: "tw-tr-original-head",
      onclick: () => {
        expanded = !expanded;
        original.classList.toggle("collapsed", !expanded);
        arrow.classList.toggle("toggled", expanded);
      },
    }, [originalTitle, arrow]),
    originalBody,
  ]);

  const langBtn = el("button", { type: "button", class: "tw-tr-lang" });
  const copyBtn = el("button", {
    type: "button",
    class: "icon-btn tw-tr-copy hidden",
    title: "Копировать",
    html: iconSvg("Copy", 18),
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(resultBody.textContent);
        copyBtn.title = "Скопировано";
      } catch {}
    },
  });
  const resultBody = el("div", { class: "tw-tr-result-text", dir: "auto" });

  langBtn.onclick = () => {
    const r = langBtn.getBoundingClientRect();
    openDropdownMenu(
      { x: r.left, y: r.bottom + 4 },
      TRANSLATE_LANGUAGES.map((l) => ({
        label: l.label,
        icon: l.id === lang ? "Check" : null,
        onClick: () => {
          lang = l.id;
          const settings = { ...(getState().settings ?? {}), translateLanguage: lang };
          setState({ settings });
          api.patchSettings({ translateLanguage: lang }).catch(() => {});
          run();
        },
      }))
    );
  };

  async function run() {
    const my = ++seq;
    const target = langOf(lang);
    langBtn.replaceChildren(el("span", {}, target?.to ?? lang), el("span", { class: "tw-tr-lang-caret", html: iconSvg("ChevronDown", 14) }));
    copyBtn.classList.add("hidden");
    const h = resultBody.offsetHeight;
    resultBody.replaceChildren(el("div", { class: "tw-tr-skeleton", style: h > 20 ? `height:${h}px` : "" }));
    try {
      const res = await translate(text, lang);
      if (my !== seq) return;
      detected = res.detected ?? detected;
      const from = langOf(detected);
      originalTitle.textContent = from ? `Перевод с ${from.in}` : "Оригинал";
      resultBody.textContent =
        res.detected && langOf(res.detected)?.id === target?.id ? "Сообщение уже на этом языке." : res.text;
      copyBtn.classList.remove("hidden");
    } catch {
      if (my !== seq) return;
      resultBody.replaceChildren(el("span", { class: "tw-tr-error" }, "Не удалось перевести. Попробуйте другой язык или позже."));
    }
  }

  overlay.appendChild(
    el("div", { class: "modal-dialog tw-tr-popup" }, [
      el("div", { class: "tw-tr-header" }, [
        el("button", { type: "button", class: "icon-btn tw-tr-close", title: "Закрыть", html: iconSvg("X", 22), onclick: close }),
        el("h2", { class: "tw-tr-title" }, "Перевод"),
      ]),
      el("div", { class: "tw-tr-scroll" }, [
        el("div", { class: "tw-tr-card" }, [
          original,
          el("div", { class: "tw-tr-divider" }),
          el("div", { class: "tw-tr-result" }, [
            el("div", { class: "tw-tr-result-head" }, [el("span", { class: "tw-tr-result-title" }, ["Перевод на ", langBtn]), copyBtn]),
            resultBody,
          ]),
        ]),
      ]),
      el("div", { class: "tw-tr-footer" }, [el("button", { type: "button", class: "tw-tr-ok", onclick: close }, "OK")]),
    ])
  );
  document.body.appendChild(overlay);
  run();
}
