import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "../components/avatar.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { iconSvg } from "../icons.js";

// Свои группы и каналы, которые можно добавить в сообщество (владелец или админ).
function ownChats() {
  const { chats, user } = getState();
  return chats.filter(
    (c) =>
      (c.type === "group" || c.type === "channel") &&
      (c.ownerId === user?.id || (c.ownerIds ?? []).includes(user?.id) || (c.adminIds ?? []).includes(user?.id))
  );
}

export function openOwnChatPicker(onPick, { exclude = [] } = {}) {
  const candidates = ownChats().filter((c) => !exclude.includes(c.id));
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const close = () => overlay.remove();
  overlay.appendChild(
    el("div", { class: "modal-dialog" }, [
      el("h2", { class: "modal-title" }, "Добавить чат в сообщество"),
      candidates.length
        ? el(
            "div",
            { class: "forward-list" },
            candidates.map((c) =>
              el("button", { class: "forward-row", onclick: () => (close(), onPick(c.id)) }, [
                Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 36 }),
                el("span", {}, `${c.type === "channel" ? "📢 " : ""}${c.title}`),
              ])
            )
          )
        : el("p", { class: "empty-hint" }, "Нет групп и каналов, где вы владелец или администратор"),
      el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
    ])
  );
  document.body.appendChild(overlay);
}

export async function CommunityView(root, id) {
  let community = null;
  let error = null;
  let busyChatId = null;

  try {
    ({ community } = await api.getCommunity(id));
  } catch (err) {
    error = err.message || "Сообщество не найдено";
  }

  async function run(fn, fallback) {
    try {
      const res = await fn();
      if (res?.community) community = res.community;
    } catch (err) {
      alert(err.message || fallback);
    }
    render();
  }

  async function join(chat) {
    busyChatId = chat.id;
    render();
    try {
      const res = await api.joinPublicChat(chat.id);
      if (res.pending) {
        alert("Заявка отправлена — администратор чата её рассмотрит");
      } else {
        await api.listChats().then((r) => setState({ chats: r.chats }));
        navigate(`/chat/${chat.id}`);
        return;
      }
    } catch (err) {
      alert(err.message || "Не удалось вступить");
    }
    busyChatId = null;
    render();
  }

  function chatRow(c) {
    const action = c.isMember
      ? el("button", { class: "profile-action-btn", onclick: () => navigate(`/chat/${c.id}`) }, "Открыть")
      : c.isPublic
        ? el("button", { class: "btn-accent", disabled: busyChatId === c.id, onclick: () => join(c) }, busyChatId === c.id ? "…" : c.type === "channel" ? "Подписаться" : "Вступить")
        : el("span", { class: "settings-toggle-hint" }, "по приглашению");
    return el("div", { class: "settings-device-row community-chat-row" }, [
      Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 40 }),
      el("div", { class: "settings-device-body" }, [
        el("p", {}, `${c.type === "channel" ? "📢 " : ""}${c.title}`),
        el("p", { class: "settings-toggle-hint" }, `${c.members} ${c.type === "channel" ? "подписчиков" : "участников"}${c.username ? ` · @${c.username}` : ""}`),
      ]),
      action,
      community.isOwner
        ? el("button", {
            class: "icon-btn",
            title: "Убрать из сообщества",
            html: iconSvg("X", 15),
            onclick: () => confirm(`Убрать «${c.title}» из сообщества?`) && run(() => api.removeCommunityChat(community.id, c.id), "Не удалось убрать чат"),
          })
        : null,
    ]);
  }

  function ownerTools() {
    return el("div", { class: "community-owner-tools" }, [
      el("button", {
        class: "profile-action-btn",
        onclick: () => openOwnChatPicker((chatId) => run(() => api.addCommunityChat(community.id, chatId), "Не удалось добавить чат"), { exclude: community.chats.map((c) => c.id) }),
      }, [el("span", { html: iconSvg("Plus", 15) }), " Добавить чат"]),
      el("button", {
        class: "profile-action-btn",
        onclick: () => {
          const title = prompt("Название сообщества", community.title)?.trim();
          if (!title) return;
          const description = prompt("Описание (можно оставить пустым)", community.description ?? "");
          if (description === null) return;
          run(() => api.updateCommunity(community.id, { title, description }), "Не удалось сохранить");
        },
      }, [el("span", { html: iconSvg("Edit", 15) }), " Изменить"]),
      el("button", {
        class: "profile-action-btn danger",
        onclick: async () => {
          if (!confirm(`Удалить сообщество «${community.title}»? Сами группы и каналы останутся.`)) return;
          try {
            await api.deleteCommunity(community.id);
            navigate("/");
          } catch (err) {
            alert(err.message || "Не удалось удалить");
          }
        },
      }, [el("span", { html: iconSvg("Trash", 15) }), " Удалить сообщество"]),
    ]);
  }

  function render() {
    if (error) {
      mount(
        root,
        el("div", { class: "join-invite" }, [
          el("h1", {}, "Сообщество не найдено"),
          el("p", { class: "settings-toggle-hint" }, error),
          el("button", { class: "btn-accent", onclick: () => navigate("/") }, "К чатам"),
        ])
      );
      return;
    }
    const link = `${location.origin}/community/${community.id}`;
    mount(
      root,
      el("div", { class: "join-invite community-page" }, [
        Avatar({ name: community.title, color: community.avatarColor, size: 72 }),
        el("h1", {}, community.title),
        el("p", { class: "settings-toggle-hint" }, `Сообщество · ${community.chats.length} чатов и каналов`),
        community.description ? el("p", { class: "join-invite-description" }, community.description) : null,
        el("button", {
          class: "profile-action-btn",
          onclick: () => navigator.clipboard?.writeText(link).then(() => alert("Ссылка на сообщество скопирована")).catch(() => {}),
        }, [el("span", { html: iconSvg("Link", 15) }), " Скопировать ссылку"]),
        community.chats.length
          ? el("div", { class: "settings-devices-list community-chat-list" }, community.chats.map(chatRow))
          : el("p", { class: "empty-hint" }, community.isOwner ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов"),
        community.isOwner ? ownerTools() : null,
        el("button", { class: "modal-cancel", onclick: () => navigate("/") }, "К чатам"),
      ])
    );
  }

  render();
}
