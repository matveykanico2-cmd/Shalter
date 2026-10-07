import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "../components/avatar.js";
import { navigate } from "../router.js";
import { iconSvg } from "../icons.js";
import { setState } from "../state.js";
import { showToast } from "../components/toast.js";
import { CommunityAvatar, openCommunityPanel, plural } from "../components/communityList.js";
import { openEditCommunityDialog, openAddChatFlow, leaveCommunity, refreshCommunities } from "../components/communityEditor.js";
import { onWsMessage } from "../lib/wsClient.js";

// Страница сообщества по ссылке /community/:id (tweb: профиль сообщества) —
// вступить в сообщество и в его открытые чаты, подать заявку, перейти в панель.

const membersLabel = (c) =>
  `${c.members} ${c.type === "channel" ? plural(c.members, "подписчик", "подписчика", "подписчиков") : plural(c.members, "участник", "участника", "участников")}`;

export async function CommunityView(root, id) {
  let community = null;
  let error = null;
  let busy = null;

  async function load() {
    try {
      ({ community } = await api.getCommunity(id));
      error = null;
    } catch (err) {
      error = err.message || "Сообщество не найдено";
    }
    render();
  }

  async function joinChat(chat) {
    busy = chat.id;
    render();
    try {
      const res = await api.joinPublicChat(chat.id);
      if (res.pending) {
        showToast(chat.type === "channel" ? "Заявка на вступление в канал отправлена" : "Заявка на вступление в группу отправлена");
      } else {
        const { chats } = await api.listChats();
        setState({ chats });
        await refreshCommunities();
        navigate(`/chat/${chat.id}`);
        return;
      }
    } catch (err) {
      showToast(err.message || "Не удалось вступить");
    }
    busy = null;
    await load();
  }

  async function joinCommunity() {
    busy = "community";
    render();
    try {
      ({ community } = await api.joinCommunity(id));
      await refreshCommunities();
      showToast("Вы вступили в сообщество");
    } catch (err) {
      showToast(err.message || "Не удалось вступить");
    }
    busy = null;
    render();
  }

  function chatRow(c) {
    const action = c.isMember
      ? el("button", { class: "profile-action-btn", onclick: () => navigate(`/chat/${c.id}`) }, "Открыть")
      : c.isPublic
        ? el("button", { class: "btn-accent", disabled: busy === c.id, onclick: () => joinChat(c) }, busy === c.id ? "…" : c.approveJoins ? "Подать заявку" : c.type === "channel" ? "Подписаться" : "Вступить")
        : el("span", { class: "settings-toggle-hint community-invite-only" }, [el("span", { html: iconSvg("Lock", 13) }), " по приглашению"]);
    return el("div", { class: "settings-device-row community-chat-row" }, [
      Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 40 }),
      el("div", { class: "settings-device-body" }, [
        el("p", {}, [c.type === "channel" ? "📢 " : "", c.title, c.visible === false ? el("span", { class: "community-hidden-icon", title: "Скрытый чат", html: iconSvg("EyeOff", 13) }) : null]),
        el("p", { class: "settings-toggle-hint" }, `${membersLabel(c)}${c.username ? ` · @${c.username}` : ""}`),
      ]),
      action,
    ]);
  }

  function render() {
    if (error || !community) {
      mount(
        root,
        el("div", { class: "join-invite" }, [
          el("h1", {}, error ? "Сообщество недоступно" : "Загрузка…"),
          error ? el("p", { class: "settings-toggle-hint" }, error) : null,
          error ? el("button", { class: "btn-accent", onclick: () => navigate("/") }, "К чатам") : null,
        ])
      );
      return;
    }
    const link = `${location.origin}/community/${community.id}`;
    const rights = community.rights ?? {};
    const reload = () => load();
    mount(
      root,
      el("div", { class: "join-invite community-page" }, [
        CommunityAvatar(community, 88),
        el("h1", {}, community.title),
        el(
          "p",
          { class: "settings-toggle-hint" },
          `Сообщество · ${community.chats.length} ${plural(community.chats.length, "чат", "чата", "чатов")} · ${community.membersCount} ${plural(community.membersCount, "участник", "участника", "участников")}`
        ),
        community.description ? el("p", { class: "join-invite-description" }, community.description) : null,
        el("div", { class: "community-owner-tools" }, [
          community.isMember
            ? el("button", { class: "btn-accent", onclick: () => openCommunityPanel(community.id) }, "Открыть в списке чатов")
            : el("button", { class: "btn-accent", disabled: busy === "community", onclick: joinCommunity }, "Вступить в сообщество"),
          el("button", {
            class: "profile-action-btn",
            onclick: () => navigator.clipboard?.writeText(link).then(() => showToast("Ссылка на сообщество скопирована"), () => {}),
          }, [el("span", { html: iconSvg("Link", 15) }), " Ссылка"]),
          community.addPolicy
            ? el("button", { class: "profile-action-btn", onclick: () => openAddChatFlow(community, reload) }, [
                el("span", { html: iconSvg("Plus", 15) }),
                community.addPolicy === "suggest" ? " Предложить чат" : " Добавить чат",
              ])
            : null,
          community.isMember
            ? el("button", { class: "profile-action-btn", onclick: () => openEditCommunityDialog(community.id, reload) }, [
                el("span", { html: iconSvg(rights.editInfo || rights.editChats ? "Edit" : "Users", 15) }),
                rights.editInfo || rights.editChats ? " Управление" : " Подробнее",
              ])
            : null,
          community.isMember && !community.isOwner
            ? el("button", { class: "profile-action-btn danger", onclick: async () => (await leaveCommunity(community)) && load() }, [el("span", { html: iconSvg("LogOut", 15) }), " Покинуть"])
            : null,
        ]),
        community.chats.length
          ? el("div", { class: "settings-devices-list community-chat-list" }, community.chats.map(chatRow))
          : el("p", { class: "empty-hint" }, community.addPolicy ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов"),
        el("button", { class: "modal-cancel", onclick: () => navigate("/") }, "К чатам"),
      ])
    );
  }

  render();
  await load();
  // Пока страница открыта — подхватываем изменения от других участников.
  const off = onWsMessage("community:updated", ({ communityId }) => {
    if (!root.isConnected) return off();
    if (communityId === id) load();
  });
}
