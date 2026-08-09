import { el } from "../lib/dom.js";
import { api } from "../api.js";

// Chat info panel → "Публичный канал" (owner/admin only, see infoPanel.js)
// — makes GET /api/channels/:id/public's isPublic/username round trip
// through a real form instead of window.prompt() (this codebase moved off
// that pattern deliberately — see createChatDialog.js's own comment on it).
export function openChannelPublicDialog(chat, onUpdated) {
  let error = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const usernameInput = el("input", {
    class: "settings-input",
    placeholder: "username",
    value: chat.username ?? "",
    autofocus: true,
  });
  const errorSlot = el("p", { class: "login-error" });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Публичный канал"),
    el("p", { class: "settings-toggle-hint" }, "С юзернеймом канал появится в поиске (⋯ → Публичные каналы) и на него можно будет подписаться по ссылке /u/username, без приглашения."),
    usernameInput,
    errorSlot,
    el(
      "button",
      {
        class: "btn-accent poll-create-btn",
        onclick: async () => {
          try {
            const { chat: updated } = await api.setChannelPublic(chat.id, true, usernameInput.value.trim());
            close();
            onUpdated(updated);
          } catch (err) {
            errorSlot.textContent = err.message || "Не удалось сохранить";
          }
        },
      },
      chat.isPublic ? "Сохранить" : "Сделать публичным"
    ),
    chat.isPublic
      ? el(
          "button",
          {
            class: "modal-cancel danger",
            onclick: async () => {
              try {
                const { chat: updated } = await api.setChannelPublic(chat.id, false);
                close();
                onUpdated(updated);
              } catch (err) {
                errorSlot.textContent = err.message || "Не удалось сохранить";
              }
            },
          },
          "Сделать приватным"
        )
      : null,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
