import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { showToast } from "./toast.js";

// Shalter AI: тариф с расходом за сегодня и «крутилки» ответов.
// Каждое изменение сохраняется сразу — кнопки «Сохранить» нет, как в настройках Telegram.

const LABELS = {
  mode: { fast: ["⚡ Быстрый", "Один запрос, ответ за секунды"], smart: ["🧠 Умный", "Длинная память, ответы без обрыва"] },
  length: { short: "Коротко", normal: "Обычно", long: "Подробно" },
  tone: { friendly: "😊 Дружелюбно", business: "💼 Деловой", fun: "😄 Весело", simple: "🧸 Просто" },
  language: { auto: "Как пишу я", ru: "Русский", en: "English" },
};

export async function openAiSettingsDialog() {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "ai-set-body" }, [el("p", { class: "ai-set-hint" }, "Загружаем…")]);
  const dialog = el("div", { class: "modal-dialog ai-set-dialog" }, [
    el("h2", { class: "modal-title" }, "Shalter AI"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  let state;
  try {
    state = await api.aiSettings();
  } catch (err) {
    body.replaceChildren(el("p", { class: "ai-set-hint" }, err.message || "Не удалось загрузить настройки"));
    return close;
  }

  let saveTimer = 0;
  let pending = {};
  function save(patch, { now = false } = {}) {
    Object.assign(state.settings, patch);
    Object.assign(pending, patch);
    clearTimeout(saveTimer);
    const run = async () => {
      const send = pending;
      pending = {};
      try {
        state = await api.updateAiSettings(send);
        render();
      } catch (err) {
        showToast(err.message || "Не удалось сохранить");
        state = await api.aiSettings().catch(() => state);
        render();
      }
    };
    if (now) run();
    else saveTimer = setTimeout(run, 400);
  }

  function segmented(key, options, { wide = false } = {}) {
    return el(
      "div",
      { class: `ai-seg ${wide || options.length === 4 ? "wide" : ""}` },
      options.map((v) => {
        const label = LABELS[key][v];
        return el(
          "button",
          {
            type: "button",
            class: `ai-seg-btn ${state.settings[key] === v ? "active" : ""}`,
            onclick: () => {
              if (state.settings[key] === v) return;
              save({ [key]: v }, { now: true });
              render();
            },
          },
          Array.isArray(label) ? [el("b", {}, label[0]), el("small", {}, label[1])] : label
        );
      })
    );
  }

  function usageBar(used, max, label) {
    const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
    return el("div", { class: "ai-usage" }, [
      el("div", { class: "ai-usage-top" }, [el("span", {}, label), el("span", { class: "ai-usage-num" }, `${used} / ${max}`)]),
      el("div", { class: `ai-usage-track ${pct >= 90 ? "full" : ""}` }, [el("span", { style: `width:${pct}%` })]),
    ]);
  }

  function planCard(p) {
    const current = p.id === state.plan.id;
    return el("div", { class: `ai-plan ${current ? "current" : ""} ${p.id}` }, [
      el("div", { class: "ai-plan-head" }, [
        el("b", {}, p.id === "premium" ? `⭐ ${p.name}` : p.name),
        current ? el("span", { class: "ai-plan-badge" }, "Ваш тариф") : null,
      ]),
      el("ul", { class: "ai-plan-perks" }, p.perks.map((t) => el("li", {}, t))),
      !current && p.id === "premium"
        ? el("button", { class: "ai-plan-btn", type: "button", onclick: () => (close(), navigate("/settings/premium")) }, "Подключить Premium")
        : null,
    ]);
  }

  function render() {
    const s = state.settings;
    const smartLocked = !state.plan.modes.includes("smart");
    const slider = el("input", {
      class: "ai-range",
      type: "range",
      min: "0",
      max: "100",
      step: "5",
      value: String(Math.round(s.creativity * 100)),
      oninput: (e) => {
        creativityValue.textContent = creativityLabel(e.target.value / 100);
        save({ creativity: e.target.value / 100 });
      },
    });
    const creativityValue = el("span", { class: "ai-range-value" }, creativityLabel(s.creativity));
    const custom = el("textarea", {
      class: "ai-custom",
      rows: 3,
      maxlength: 500,
      placeholder: "Например: «обращайся на ты», «я программист на Python», «отвечай с эмодзи»",
      value: s.custom,
      oninput: (e) => save({ custom: e.target.value }),
    });

    clear(body);
    body.append(
      el("section", { class: "ai-set-section" }, [
        el("h3", {}, "Тариф и лимиты на сегодня"),
        usageBar(state.usage.texts, state.plan.textsPerDay, "Ответы"),
        usageBar(state.usage.images, state.plan.imagesPerDay, "Картинки"),
        el("div", { class: "ai-plans" }, state.plans.map(planCard)),
      ]),
      el("section", { class: "ai-set-section" }, [
        el("h3", {}, "Режим"),
        Object.assign(segmented("mode", ["fast", "smart"], { wide: true }), { className: "ai-seg wide ai-seg-mode" }),
        smartLocked ? el("p", { class: "ai-set-hint" }, "🔒 Умный режим — в Premium.") : null,
      ]),
      el("section", { class: "ai-set-section" }, [el("h3", {}, "Длина ответов"), segmented("length", ["short", "normal", "long"])]),
      el("section", { class: "ai-set-section" }, [el("h3", {}, "Тон"), segmented("tone", ["friendly", "business", "fun", "simple"])]),
      el("section", { class: "ai-set-section" }, [
        el("h3", { class: "ai-range-head" }, ["Креативность", creativityValue]),
        slider,
        el("div", { class: "ai-range-scale" }, [el("span", {}, "Точно"), el("span", {}, "Фантазия")]),
      ]),
      el("section", { class: "ai-set-section" }, [el("h3", {}, "Язык ответов"), segmented("language", ["auto", "ru", "en"])]),
      el("section", { class: "ai-set-section" }, [el("h3", {}, "О вас и ваших пожеланиях"), custom])
    );
    if (smartLocked) body.querySelector(".ai-seg-mode .ai-seg-btn:last-child")?.classList.add("locked");
  }
  render();
  return close;
}

function creativityLabel(v) {
  return v < 0.3 ? "точно" : v > 0.8 ? "фантазия" : "сбалансированно";
}
