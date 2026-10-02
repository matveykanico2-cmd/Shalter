import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { repeatLabel } from "./scheduleSendDialog.js";

export function openScheduledMessagesDialog(chatId, { onChange } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "wallpaper-dialog-body" });
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Запланированные сообщения"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  function row(s) {
    const when = new Date(s.sendAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return el("div", { class: "scheduled-msg-row" }, [
      el("div", { class: "scheduled-msg-body" }, [
        el("p", { class: "scheduled-msg-text" }, s.text || "Медиа"),
        el("p", { class: "scheduled-msg-time" }, s.repeat ? `${when} · 🔁 ${repeatLabel(s.repeat)}` : when),
      ]),
      el("div", { class: "scheduled-msg-actions" }, [
        el("button", {
          class: "icon-btn",
          title: "Отправить сейчас",
          html: iconSvg("Send", 15),
          onclick: async () => {
            await api.editScheduled(chatId, s.id, { sendAt: new Date(Date.now() - 1000).toISOString() });
            onChange?.();
            load();
          },
        }),
        el("button", {
          class: "icon-btn",
          title: "Удалить",
          html: iconSvg("Trash", 15),
          onclick: async () => {
            await api.deleteScheduled(chatId, s.id);
            onChange?.();
            load();
          },
        }),
      ]),
    ]);
  }

  async function load() {
    clear(body);
    body.appendChild(el("p", { class: "empty-hint" }, "Загрузка…"));
    try {
      const { scheduled } = await api.listScheduled(chatId);
      clear(body);
      if (!scheduled.length) {
        body.appendChild(el("p", { class: "empty-hint" }, "Нет запланированных сообщений"));
        return;
      }
      scheduled.forEach((s) => body.appendChild(row(s)));
    } catch {
      clear(body);
      body.appendChild(el("p", { class: "login-error" }, "Не удалось загрузить"));
    }
  }

  load();
  document.body.appendChild(overlay);
}
