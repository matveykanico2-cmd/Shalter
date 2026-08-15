import { el } from "../lib/dom.js";
import { api } from "../api.js";

// Shown right after a private group or channel is created — the way Telegram
// hands you the invite link the moment there is one. Without it a private chat
// is born with no way in, and the link is buried two screens deep in editing.
export function openInviteLinkDialog(chat) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const linkInput = el("input", { class: "login-input mono invite-link-input", readOnly: true, value: "Получаем ссылку…" });
  const note = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, `${chat.type === "channel" ? "Канал" : "Группа"} создан${chat.type === "channel" ? "" : "а"}`),
    el(
      "p",
      { class: "settings-toggle-hint" },
      "Это частный чат — вступить можно только по ссылке. Отправьте её тем, кого зовёте; отозвать её можно в настройках чата."
    ),
    linkInput,
    note,
    el(
      "button",
      {
        class: "btn-accent",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(linkInput.value);
            note.textContent = "Ссылка скопирована ✓";
          } catch {
            note.textContent = "Скопируйте ссылку вручную — буфер обмена недоступен";
          }
        },
      },
      "Скопировать ссылку"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  api
    .chatInviteLink(chat.id)
    .then(({ code }) => {
      linkInput.value = `${window.location.origin}/join/${code}`;
    })
    .catch((err) => {
      linkInput.value = "";
      note.textContent = err.message || "Не удалось создать ссылку — её можно получить в настройках чата";
    });
}
