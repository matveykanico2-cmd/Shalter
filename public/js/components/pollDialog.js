import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Real poll creation — question + 2..8 options. Voting is persisted
// server-side (server/data/messages.js votePoll), unlike a UI-only mock.
export function openPollDialog(onCreate) {
  let optionCount = 2;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const questionInput = el("input", { class: "login-input", placeholder: "Вопрос", autofocus: true });
  const optionsSlot = el("div", { class: "poll-options-list" });
  const errorSlot = el("p", { class: "login-error" });

  function renderOptions() {
    optionsSlot.textContent = "";
    for (let i = 0; i < optionCount; i++) {
      optionsSlot.appendChild(
        el("input", { class: "settings-input poll-option-input", placeholder: `Вариант ${i + 1}`, "data-idx": i })
      );
    }
    if (optionCount < 8) {
      optionsSlot.appendChild(
        el(
          "button",
          {
            class: "choice-dialog-btn",
            onclick: () => {
              optionCount++;
              renderOptions();
            },
          },
          [el("span", { html: iconSvg("Plus", 14) }), " Добавить вариант"]
        )
      );
    }
  }
  renderOptions();

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Новый опрос"),
    questionInput,
    optionsSlot,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const question = questionInput.value.trim();
          const options = [...optionsSlot.querySelectorAll(".poll-option-input")]
            .map((i) => i.value.trim())
            .filter(Boolean);
          if (!question) return (errorSlot.textContent = "Введите вопрос");
          if (options.length < 2) return (errorSlot.textContent = "Нужно хотя бы 2 варианта ответа");
          close();
          onCreate(question, options);
        },
      },
      "Создать"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
