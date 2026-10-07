import { el, mount } from "../lib/dom.js";
import { api } from "../api.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { MessageBubble } from "../components/messageBubble.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { paintWallpaper } from "../lib/wallpapers.js";
import { showToast } from "../components/toast.js";

// Публичный канал или группа, где вы ещё не состоите, — как в tweb: открывается
// сама лента (только чтение), а вместо поля ввода внизу — «ПОДПИСАТЬСЯ» /
// «ВСТУПИТЬ» / «ПОДАТЬ ЗАЯВКУ». После вступления открывается обычный чат.

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export async function ChatPreviewView(root, chatId, { msg = null } = {}) {
  const me = getState().user;
  let data;
  try {
    data = await api.chatPreview(chatId);
  } catch (err) {
    mount(
      root,
      el("div", { class: "join-invite" }, [
        el("h1", {}, "Чат недоступен"),
        el("p", { class: "settings-toggle-hint" }, err.message || "Не удалось открыть чат"),
        el("button", { class: "btn-accent", onclick: () => navigate("/") }, "К чатам"),
      ])
    );
    return;
  }
  const { chat } = data;
  if (chat.isMember) {
    navigate(`/chat/${chat.id}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`, { replace: true });
    return;
  }

  const isChannel = chat.type === "channel";
  const senders = new Map((data.senders ?? []).map((u) => [u.id, u]));
  let busy = false;
  let requestPending = !!chat.requestPending;

  // В превью всё, что меняет чат, просит сначала вступить.
  const needJoin = () => showToast(isChannel ? "Сначала подпишитесь на канал" : "Сначала вступите в группу");
  const handlers = new Proxy({}, { get: () => needJoin });

  const header = el("header", { class: "chat-header" }, [
    el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
    el("div", { class: "chat-header-info-btn" }, [
      Avatar({ name: chat.title, color: chat.avatarColor, image: chat.avatarImage, size: 38 }),
      el("div", { class: "chat-header-titles" }, [
        el("p", { class: "chat-header-title" }, [el("span", { class: "chat-header-title-text" }, chat.title), VerifiedBadge(chat, 15)].filter(Boolean)),
        el(
          "p",
          { class: "chat-header-subtitle" },
          `${chat.subscribers} ${isChannel ? plural(chat.subscribers, "подписчик", "подписчика", "подписчиков") : plural(chat.subscribers, "участник", "участника", "участников")}`
        ),
      ]),
    ]),
  ]);

  const list = el("div", { class: "message-list chat-preview-list" });
  paintWallpaper(list, { id: getState().settings?.chatWallpaper ?? "default", image: getState().settings?.chatWallpaperImage });
  if (chat.description) {
    list.appendChild(el("div", { class: "chat-preview-about" }, [el("p", { class: "chat-preview-about-title" }, isChannel ? "О канале" : "О группе"), el("p", {}, chat.description)]));
  }
  const messages = data.messages ?? [];
  if (!messages.length) list.appendChild(el("p", { class: "empty-hint" }, isChannel ? "В канале пока нет постов" : "В группе пока нет сообщений"));
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
      list.appendChild(el("div", { class: "date-divider" }, el("span", { class: "date-divider-btn" }, dayLabel(m.createdAt))));
    }
    if (m.type === "system") {
      list.appendChild(el("div", { class: "system-message" }, [el("span", { class: "system-message-text" }, m.text ?? "")]));
      return;
    }
    const sender = senders.get(m.senderId) ?? null;
    const runs = (a, b) => a && b && a.senderId === b.senderId && a.type !== "system" && b.type !== "system" && sameDay(a.createdAt, b.createdAt);
    list.appendChild(
      MessageBubble({
        message: { reactions: [], readByIds: [], ...m },
        me,
        sender,
        showSender: !isChannel && !runs(prev, m),
        groupStart: !runs(prev, m),
        groupEnd: !runs(m, next),
        isChannel,
        isDm: false,
        canPin: false,
        selection: null,
        members: [...senders.values()],
        handlers,
        allowedReactions: [],
        canViewReactionDetails: false,
      })
    );
  });

  const joinLabel = () => (requestPending ? "ЗАЯВКА ОТПРАВЛЕНА" : chat.approveJoins ? "ПОДАТЬ ЗАЯВКУ" : isChannel ? "ПОДПИСАТЬСЯ" : "ВСТУПИТЬ В ГРУППУ");
  const joinBtn = el("button", { type: "button", class: "chat-preview-join", onclick: join }, joinLabel());
  const bottom = el("div", { class: "chat-preview-bottom" }, [joinBtn]);
  const sync = () => {
    joinBtn.textContent = busy ? "…" : joinLabel();
    joinBtn.disabled = busy || requestPending;
  };

  async function join() {
    if (busy || requestPending) return;
    busy = true;
    sync();
    try {
      const res = await api.joinPublicChat(chat.id);
      if (res.pending) {
        requestPending = true;
        showToast(isChannel ? "Заявка на вступление в канал отправлена" : "Заявка на вступление в группу отправлена");
      } else {
        const { chats } = await api.listChats();
        setState({ chats });
        navigate(`/chat/${chat.id}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`, { replace: true });
        return;
      }
    } catch (err) {
      showToast(err.message || "Не удалось вступить");
    }
    busy = false;
    sync();
  }
  sync();

  mount(root, el("div", { class: "chat-view chat-preview" }, [el("div", { class: "chat-main-col" }, [header, list, bottom])]));
  requestAnimationFrame(() => {
    const target = msg ? list.querySelector(`#msg-${CSS.escape(msg)}`) : null;
    if (target) target.scrollIntoView({ block: "center" });
    else list.scrollTop = list.scrollHeight;
  });
}
