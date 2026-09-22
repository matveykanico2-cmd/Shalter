import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "../components/avatar.js";
import { navigate } from "../router.js";
import { setState } from "../state.js";

// Ссылка-приглашение на папку (server/routes/folders.js) — тот же принцип
// превью-перед-действием, что и у JoinInviteView для чата: показываем, что
// внутри, прежде чем что-то создавать или к чему-то присоединять.
export async function FolderInviteView(root, code) {
  let info = null;
  let error = null;
  let busy = false;
  let imported = null;

  try {
    info = await api.getFolderInvite(code);
  } catch (err) {
    error = err.message || "Ссылка недействительна";
  }

  async function importFolder() {
    if (busy) return;
    busy = true;
    render();
    try {
      const { folder } = await api.importFolderInvite(code);
      imported = folder;
      await api.listFolders().then((r) => setState({ folders: r.folders }));
    } catch (err) {
      error = err.message || "Не удалось добавить папку";
      busy = false;
    }
    render();
  }

  function render() {
    if (error) {
      mount(
        root,
        el("div", { class: "join-invite" }, [
          el("h1", {}, "Ссылка не работает"),
          el("p", { class: "settings-toggle-hint" }, error),
          el("button", { class: "btn-accent", onclick: () => navigate("/") }, "К чатам"),
        ])
      );
      return;
    }
    mount(
      root,
      el("div", { class: "join-invite" }, [
        el("h1", {}, `Папка «${info.name}»`),
        el(
          "p",
          { class: "settings-toggle-hint" },
          info.chats.length ? `${info.chats.length} чатов и каналов` : "В папке нет публичных чатов — добавить будет нечего"
        ),
        info.chats.length
          ? el(
              "div",
              { class: "settings-devices-list" },
              info.chats.map((c) =>
                el("div", { class: "settings-device-row" }, [
                  Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 32 }),
                  el("div", { class: "settings-device-body" }, [el("p", {}, c.title)]),
                ])
              )
            )
          : null,
        imported
          ? el("button", { class: "btn-accent", onclick: () => navigate("/") }, "Готово — открыть чаты")
          : el(
              "button",
              { class: "btn-accent", disabled: busy || !info.chats.length, onclick: importFolder },
              busy ? "Добавляем…" : "Добавить папку себе"
            ),
        el("button", { class: "modal-cancel", onclick: () => navigate("/") }, "Не сейчас"),
      ])
    );
  }

  render();
}
