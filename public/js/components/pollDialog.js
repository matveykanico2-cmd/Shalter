import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Real poll creation — question + 2..8 options. Voting is persisted
// server-side (server/data/messages.js votePoll), unlike a UI-only mock.
//
// Режим викторины: у вопроса есть один правильный ответ, и он объявляется
// сразу после голоса. Это не «опрос с пометкой», а другой разговор: в опросе
// интересно, что думают остальные, а в викторине — угадал человек или нет,
// поэтому проценты там уходят на второй план, а на первый выходят «верно» и
// «неверно» (см. PollAttachment в messageBubble.js).
//
// onCreate(question, options, { correctIndex }) — correctIndex равен null для
// обычного опроса.
export function openPollDialog(onCreate) {
  let optionCount = 2;
  let quiz = false;
  let correctIndex = 0;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const questionInput = el("input", { class: "login-input", placeholder: "Вопрос", autofocus: true });
  const optionsSlot = el("div", { class: "poll-options-list" });
  const errorSlot = el("p", { class: "login-error" });

  function renderOptions() {
    // Введённое сохраняем: перерисовка идёт и при «добавить вариант», и при
    // выборе правильного ответа, а терять набранный текст на каждое нажатие —
    // ровно та беда, из-за которой в этом проекте поля живут вне render().
    const typed = [...optionsSlot.querySelectorAll(".poll-option-input")].map((i) => i.value);
    optionsSlot.textContent = "";
    for (let i = 0; i < optionCount; i++) {
      const input = el("input", { class: "settings-input poll-option-input", placeholder: `Вариант ${i + 1}`, "data-idx": i });
      input.value = typed[i] ?? "";
      // В викторине у каждого варианта своя кнопка «это правильный»: отдельным
      // списком «выберите номер верного ответа» пришлось бы сверять глазами
      // номер с текстом.
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
  function renderMode() {
    const [pollBtn, quizBtn] = modeRow.childNodes;
    pollBtn.className = `ad-placement ${quiz ? "" : "active"}`;
    quizBtn.className = `ad-placement ${quiz ? "active" : ""}`;
    modeHint.textContent = quiz
      ? "Отметьте галочкой правильный ответ. Ответивший сразу увидит, угадал он или нет."
      : "Обычный опрос: правильного ответа нет, видно только кто как проголосовал.";
  }
  renderMode();

  const dialog = el("div", { class: "modal-dialog" }, [
    title,
    modeRow,
    modeHint,
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
          // Правильный ответ мог указывать на пустой вариант, который отсеялся
          // фильтром выше, — тогда викторина уехала бы с ответом «ни на что».
          if (quiz && !options[correctIndex]) return (errorSlot.textContent = "Отметьте правильный ответ");
          close();
          onCreate(question, options, { correctIndex: quiz ? correctIndex : null });
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
