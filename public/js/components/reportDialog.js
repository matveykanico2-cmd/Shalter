import { el } from "../lib/dom.js";
import { api } from "../api.js";

const REASONS = [
  { value: "spam", label: "Спам" },
  { value: "scam", label: "Мошенничество" },
  { value: "violence", label: "Насилие или угрозы" },
  { value: "illegal", label: "Незаконный контент" },
  { value: "child_safety", label: "Угроза безопасности детей" },
  { value: "other", label: "Другое" },
];

// targetType: "user" | "chat" (a group/channel is just a chat with that type,
// same as everywhere else in this app — see server/routes/reports.js).
export function openReportDialog(targetType, targetId, targetLabel) {
  let reason = REASONS[0].value;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const errorSlot = el("p", { class: "login-error" });
  const detailsInput = el("textarea", {
    class: "settings-input",
    rows: 3,
    placeholder: "Подробности (необязательно)",
  });

  const reasonList = el(
    "div",
    { class: "poll-options-list" },
    REASONS.map((r) =>
      el("label", { class: "forward-row member-picker-row" }, [
        el("input", {
          type: "radio",
          name: "report-reason",
          checked: r.value === reason,
          onchange: () => (reason = r.value),
        }),
        el("span", {}, r.label),
      ])
    )
  );

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, `Пожаловаться${targetLabel ? ` на ${targetLabel}` : ""}`),
    reasonList,
    detailsInput,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await api.submitReport(targetType, targetId, reason, detailsInput.value);
            close();
          } catch (err) {
            errorSlot.textContent = err.message || "Не удалось отправить жалобу";
            e.target.disabled = false;
          }
        },
      },
      "Отправить жалобу"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
