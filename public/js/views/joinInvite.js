import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { navigate } from "../router.js";
import { setState } from "../state.js";

export function JoinInviteView(root, code) {
  return JoinView(root, {
    load: async () => (await api.inviteInfo(code)).chat,
    join: () => api.joinByInvite(code),
    failTitle: "Ссылка не работает",
  });
}

// A public group/channel opened by its @username.
export function JoinPublicView(root, chat, { msg = null } = {}) {
  return JoinView(root, {
    afterJoin: msg ? `?msg=${encodeURIComponent(msg)}` : "",
    load: async () => ({ ...chat, memberCount: chat.subscribers, alreadyMember: chat.isMember }),
    join: () => api.joinPublicChat(chat.id),
    failTitle: "Не удалось вступить",
  });
}

async function JoinView(root, { load, join: doJoin, failTitle, afterJoin = "" }) {
  let info = null;
  let error = null;
  let busy = false;

  try {
    info = await load();
    if (info.banned) error = "Вас заблокировали в этом чате";
  } catch (err) {
    error = err.message || "Ссылка недействительна";
  }

  async function join() {
    if (busy) return;
    busy = true;
    render();
    try {
      const res = await doJoin();
      if (res.pending) {
        info = { ...info, requestPending: true };
        busy = false;
        render();
        return;
      }
      await api.listChats().then((r) => setState({ chats: r.chats }));
      navigate(`/chat/${res.chat.id}${afterJoin}`);
    } catch (err) {
      error = err.message || "Не удалось присоединиться";
      busy = false;
      render();
    }
  }

  function render() {
    if (error) {
      mount(
        root,
        el("div", { class: "join-invite" }, [
          el("h1", {}, failTitle),
          el("p", { class: "settings-toggle-hint" }, error),
          el("button", { class: "btn-accent", onclick: () => navigate("/") }, "К чатам"),
        ])
      );
      return;
    }
    const what = info.type === "channel" ? "каналу" : "группе";
    mount(
      root,
      el("div", { class: "join-invite" }, [
        Avatar({ name: info.title, color: info.avatarColor, image: info.avatarImage, size: 88 }),
        el("h1", {}, [info.title, VerifiedBadge(info, 18)].filter(Boolean)),
        el("p", { class: "settings-toggle-hint" }, `${info.memberCount} ${info.type === "channel" ? "подписчиков" : "участников"}`),
        info.description ? el("p", { class: "join-invite-description" }, info.description) : null,
        info.alreadyMember
          ? el("button", { class: "btn-accent", onclick: () => navigate(`/chat/${info.id}`) }, "Открыть")
          : info.requestPending
            ? el("p", { class: "settings-toggle-hint" }, "Заявка отправлена — администратор её рассмотрит, и чат появится в списке.")
            : el(
                "button",
                { class: "btn-accent", disabled: busy, onclick: join },
                busy ? "Отправляем…" : info.approveJoins ? "Подать заявку" : `Присоединиться к ${what}`
              ),
        !info.alreadyMember && info.approveJoins && !info.requestPending
          ? el("p", { class: "settings-toggle-hint" }, "Вступление по заявке — админ должен её одобрить.")
          : null,
        el("button", { class: "modal-cancel", onclick: () => navigate("/") }, "Не сейчас"),
      ].filter(Boolean))
    );
  }

  render();
}
