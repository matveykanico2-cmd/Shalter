import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

export function openPollDialog(onCreate) {
  let optionCount = 2;
  let quiz = false;
  let correctIndex = 0;
  let multiple = false;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const questionInput = el("input", { class: "login-input", placeholder: "Вопрос", autofocus: true });
  const optionsSlot = el("div", { class: "poll-options-list" });
  const errorSlot = el("p", { class: "login-error" });

  function renderOptions() {
    const typed = [...optionsSlot.querySelectorAll(".poll-option-input")].map((i) => i.value);
    optionsSlot.textContent = "";
    for (let i = 0; i < optionCount; i++) {
      const input = el("input", { class: "settings-input poll-option-input", placeholder: `Вариант ${i + 1}`, "data-idx": i });
      input.value = typed[i] ?? "";
      optionsSlot.appendChild(
        quiz
          ? el("div", { class: "poll-quiz-row" }, [
              el("button", {
                class: `poll-quiz-mark ${correctIndex === i ? "active" : ""}`,
                title: "Правильный ответ",
                onclick: () => {
                  correctIndex = i;
                  renderOptions();
                },
              }, correctIndex === i ? "✓" : ""),
              input,
            ])
          : input
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

  const title = el("h2", { class: "modal-title" }, "Новый опрос");
  const modeRow = el("div", { class: "ad-placements" }, [
    el("button", {
      class: `ad-placement ${quiz ? "" : "active"}`,
      onclick: () => {
        quiz = false;
        title.textContent = "Новый опрос";
        renderMode();
        renderOptions();
      },
    }, "Опрос"),
    el("button", {
      class: `ad-placement ${quiz ? "active" : ""}`,
      onclick: () => {
        quiz = true;
        title.textContent = "Новая викторина";
        renderMode();
        renderOptions();
      },
    }, "Викторина"),
  ]);
  const modeHint = el("p", { class: "settings-toggle-hint" });
  const multipleBox = el("input", { type: "checkbox", onchange: (e) => (multiple = e.target.checked) });
  const multipleRow = el("label", { class: "poll-multiple-row" }, [multipleBox, el("span", {}, "Несколько вариантов ответа")]);
  function renderMode() {
    const [pollBtn, quizBtn] = modeRow.childNodes;
    pollBtn.className = `ad-placement ${quiz ? "" : "active"}`;
    quizBtn.className = `ad-placement ${quiz ? "active" : ""}`;
    modeHint.textContent = quiz
      ? "Отметьте галочкой правильный ответ. Ответивший сразу увидит, угадал он или нет."
      : "Обычный опрос: правильного ответа нет, видно только кто как проголосовал.";
    multipleRow.style.display = quiz ? "none" : "";
  }
  renderMode();

  const dialog = el("div", { class: "modal-dialog" }, [
    title,
    modeRow,
    modeHint,
    questionInput,
    optionsSlot,
    multipleRow,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: () => {
          const question = questionInput.value.trim();
          const raw = [...optionsSlot.querySelectorAll(".poll-option-input")].map((i) => i.value.trim());
          const options = raw.filter(Boolean);
          if (!question) return (errorSlot.textContent = "Введите вопрос");
          if (options.length < 2) return (errorSlot.textContent = "Нужно хотя бы 2 варианта ответа");
          if (quiz && !raw[correctIndex]) return (errorSlot.textContent = "Отметьте правильный ответ");
          const correct = quiz ? raw.slice(0, correctIndex).filter(Boolean).length : null;
          close();
          onCreate(question, options, { correctIndex: correct, multiple: !quiz && multiple });
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
