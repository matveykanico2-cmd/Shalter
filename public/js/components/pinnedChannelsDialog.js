import { el, clear, appendAll } from "../lib/dom.js";
import { plural } from "../lib/presence.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";

export function openPinnedChannelsDialog({ pinned = [], onSaved } = {}) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "pinned-dialog-body" });
  const dialog = el("div", { class: "modal-dialog pinned-dialog" }, [
    el("h2", { class: "modal-title" }, "Каналы в профиле"),
    body,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  let chosen = pinned.map((c) => c.id);
  let channels = [];
  let max = 6;
  let saving = false;
  let error = null;

  function toggle(id) {
    if (chosen.includes(id)) chosen = chosen.filter((x) => x !== id);
    else if (chosen.length < max) chosen = [...chosen, id];
    else error = `Больше ${max} каналов в профиль не поместится`;
    render();
  }

  async function save() {
    saving = true;
    error = null;
    render();
    try {
      const { pinnedChannels } = await api.setPinnedChannels(chosen);
      onSaved?.(pinnedChannels);
      close();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
      saving = false;
      render();
    }
  }

  function render() {
    clear(body);
    if (!channels.length) {
      appendAll(body,
        el("p", { class: "settings-toggle-hint" }, "Здесь появятся ваши публичные каналы — те, где вы владелец или администратор."),
        el("p", { class: "settings-toggle-hint" }, "У закрытого канала сначала нужно включить публичную ссылку: посторонний всё равно не сможет по нему перейти."),
        el("div", { class: "pinned-dialog-actions" }, [el("button", { class: "btn-secondary", onclick: close }, "Закрыть")])
      );
      return;
    }
    appendAll(body,
      el(
        "div",
        { class: "pinned-list" },
        channels.map((c) => {
          const index = chosen.indexOf(c.id);
          return el(
            "button",
            { class: `pinned-row ${index >= 0 ? "on" : ""}`, type: "button", onclick: () => toggle(c.id) },
            [
              Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 36 }),
              el("div", { class: "pinned-row-body" }, [
                el("p", { class: "pinned-row-title" }, c.title),
                el("p", { class: "pinned-row-sub" }, c.username ? `@${c.username}` : `${c.members} ${plural(c.members, "подписчик", "подписчика", "подписчиков")}`),
              ]),
              el("span", { class: "pinned-row-mark" }, index >= 0 ? String(index + 1) : ""),
            ]
          );
        })
      ),
      error ? el("p", { class: "login-error" }, error) : null,
      el("div", { class: "pinned-dialog-actions" }, [
        el("button", { class: "btn-secondary", onclick: close }, "Отмена"),
        el("button", { class: "btn-accent", disabled: saving, onclick: save }, saving ? "Сохраняем…" : "Сохранить"),
      ])
    );
  }

  render();
  api
    .getPinnableChannels()
    .then((r) => {
      channels = r.channels ?? [];
      max = r.max ?? max;
      const ids = new Set(channels.map((c) => c.id));
      chosen = chosen.filter((id) => ids.has(id));
      render();
    })
    .catch((err) => {
      error = err.message || "Не удалось загрузить список каналов";
      render();
    });

  return { close };
}
