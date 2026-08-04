import { el, clear } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openReportDialog } from "./reportDialog.js";

function statusLabel(user) {
  if (user.online) return "в сети";
  if (!user.lastSeen) return null; // hidden by their privacy settings, or never set
  const d = new Date(user.lastSeen);
  return `был(а) в сети ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

// Full profile view — reachable from Contacts and from a DM's info panel.
// Unlike the compact InfoPanel (chat-scoped: mute/members/etc.), this is the
// one place a user's bio/username/phone/status all show together, and the
// one place server/routes/users.js's privacy-aware GET actually gets used.
export async function openProfileDialog(userId) {
  const me = getState().user;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "profile-dialog-body" }, [el("div", { class: "profile-loading-spinner" })]);
  const dialog = el("div", { class: "modal-dialog profile-dialog" }, [
    el("button", { class: "icon-btn profile-dialog-close", html: iconSvg("X", 18), onclick: () => close() }),
    body,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  let user, isContact, isBlocked;
  try {
    const res = await api.getUser(userId);
    user = res.user;
    isContact = res.isContact;
    isBlocked = !!me.blockedUserIds?.includes(userId);
  } catch (err) {
    clear(body);
    body.appendChild(el("p", { class: "login-error center" }, err.message || "Не удалось загрузить профиль"));
    return;
  }

  async function toggleBlock() {
    await api.setBlocked(userId, !isBlocked);
    isBlocked = !isBlocked;
    const blockedUserIds = new Set(getState().user.blockedUserIds ?? []);
    if (isBlocked) blockedUserIds.add(userId);
    else blockedUserIds.delete(userId);
    setState({ user: { ...getState().user, blockedUserIds: [...blockedUserIds] } });
    render();
  }

  async function startChat() {
    const { chat } = await api.startDm(userId, user.name, user.avatarColor);
    close();
    navigate(`/chat/${chat.id}`);
  }

  function render() {
    clear(body);
    const status = statusLabel(user);
    // Plain Element.append() (unlike dom.js's el()/mount()) stringifies null
    // arguments into literal "null" text nodes — filter them out first.
    const children = [
      el("div", { class: "profile-avatar-row" }, [
        Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 88, online: user.online, isPremium: user.isPremium, isDeveloper: user.isDeveloper, orbit: true }),
      ]),
      el("p", { class: "profile-name" }, [
        user.name || "Без имени",
        user.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
        user.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
      ]),
      user.username ? el("p", { class: "profile-username" }, `@${user.username}`) : null,
      status ? el("p", { class: "profile-status" }, status) : null,
      user.bio ? el("p", { class: "profile-bio" }, user.bio) : null,
      user.phone
        ? el("div", { class: "profile-field-row" }, [el("span", { html: iconSvg("Phone", 15) }), el("span", { class: "mono" }, user.phone)])
        : null,
      isContact ? el("p", { class: "profile-contact-tag" }, "В ваших контактах") : null,
      el("div", { class: "profile-actions" }, [
        el("button", { class: "btn-accent", onclick: startChat }, [el("span", { html: iconSvg("Send", 16) }), " Написать"]),
        el(
          "button",
          { class: `profile-action-btn ${isBlocked ? "danger" : ""}`, onclick: toggleBlock },
          isBlocked ? "Разблокировать" : "Заблокировать"
        ),
        el(
          "button",
          { class: "profile-action-btn danger", onclick: () => openReportDialog("user", userId, user.name) },
          "Пожаловаться"
        ),
      ]),
    ];
    body.append(...children.filter(Boolean));
  }
  render();
}
