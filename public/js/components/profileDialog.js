import { el, clear } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openReportDialog } from "./reportDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard } from "./attachments.js";
import { statusLabel } from "../lib/presence.js";

// Bottom tab strip, same set/order as Telegram's own profile view. Content
// for media/files/links comes from GET /api/users/:id/shared-media (scoped
// to whatever DM already exists with this user — see server/routes/users.js);
// gifts reuse the user object's own giftsReceived, already loaded with it.
const TABS = [
  { id: "media", label: "Медиа" },
  { id: "gifts", label: "Подарки" },
  { id: "files", label: "Файлы" },
  { id: "links", label: "Ссылки" },
];

// Full profile view — reachable from Contacts and from a DM's info panel.
// Unlike the compact InfoPanel (chat-scoped: mute/members/etc.), this is the
// one place a user's bio/username/phone/status all show together, and the
// one place server/routes/users.js's privacy-aware GET actually gets used.
// Rendered as a right-docked slide-in panel (like Telegram's own profile/
// channel-info view) rather than a centered modal.
export async function openProfileDialog(userId) {
  const me = getState().user;

  const overlay = el("div", { class: "profile-panel-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "info-panel-body profile-panel-body" }, [el("div", { class: "profile-loading-spinner" })]);
  const panel = el("aside", { class: "profile-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, "Профиль"),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
    ]),
    body,
  ]);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  let user, isContact, isBlocked;
  let sharedMedia = { media: [], files: [], links: [] };
  let activeTab = "media";

  try {
    const [res] = await Promise.all([
      api.getUser(userId),
      api
        .getSharedMedia(userId)
        .then((r) => (sharedMedia = r))
        .catch(() => {}), // best-effort — tabs just render empty if this fails
    ]);
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

  // Real E2E (public/js/lib/e2e.js) — needs the target to already have a
  // public key uploaded, which the server checks (and error-messages) for
  // us; nothing to pre-validate client-side beyond not double-submitting.
  async function startSecretChat() {
    try {
      const { chat } = await api.startSecretChat(userId);
      close();
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      alert(err.message || "Не удалось начать секретный чат");
    }
  }

  function renderTabContent() {
    if (activeTab === "gifts") {
      const gifts = user.giftsReceived ?? [];
      if (!gifts.length) return el("p", { class: "profile-empty-tab" }, "Подарков пока нет");
      return el(
        "div",
        { class: "profile-gifts-row" },
        gifts
          .slice()
          .reverse()
          .map((g) => el("span", { class: "profile-gift-chip", title: g.name }, g.emoji))
      );
    }
    if (activeTab === "media") {
      if (!sharedMedia.media.length) return el("p", { class: "profile-empty-tab" }, "Медиа пока нет");
      return el(
        "div",
        { class: "profile-media-grid" },
        sharedMedia.media.map((m) => (m.attachment.kind === "video" ? VideoAttachment(m.attachment) : ImageAttachment(m.attachment)))
      );
    }
    if (activeTab === "files") {
      if (!sharedMedia.files.length) return el("p", { class: "profile-empty-tab" }, "Файлов пока нет");
      return el("div", { class: "profile-files-list" }, sharedMedia.files.map((f) => FileAttachment(f.attachment)));
    }
    // links
    if (!sharedMedia.links.length) return el("p", { class: "profile-empty-tab" }, "Ссылок пока нет");
    return el(
      "div",
      { class: "profile-links-list" },
      sharedMedia.links
        .map((l) => {
          if (l.linkPreview?.title || l.linkPreview?.description || l.linkPreview?.image) return LinkPreviewCard(l.linkPreview);
          const url = l.text?.match(/https?:\/\/\S+/)?.[0];
          return url ? el("a", { class: "profile-link-item", href: url, target: "_blank", rel: "noreferrer" }, url) : null;
        })
        .filter(Boolean)
    );
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
      user.birthday
        ? el("div", { class: "profile-field-row" }, [
            el("span", {}, "🎂"),
            el("span", {}, new Date(user.birthday).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" })),
          ])
        : null,
      isContact ? el("p", { class: "profile-contact-tag" }, "В ваших контактах") : null,
      // Ad cabinet (Settings → Реклама, server/routes/ads.js) — an active
      // subscriber's one promotional text/link, shown here rather than in
      // the chat itself since a profile view is a deliberate "look someone
      // up" action, not something to interrupt a conversation with.
      user.isAdsActive && user.adText
        ? el("div", { class: "profile-ad-banner" }, [
            el("span", { class: "profile-ad-label" }, "Реклама"),
            user.adAttachments?.length
              ? el(
                  "div",
                  { class: "profile-ad-gallery" },
                  user.adAttachments.map((a) => (a.kind === "video" ? VideoAttachment(a) : a.kind === "image" ? ImageAttachment(a) : FileAttachment(a)))
                )
              : null,
            el("p", { class: "profile-ad-text" }, user.adText),
            user.adUrl ? el("a", { class: "profile-ad-link", href: user.adUrl, target: "_blank", rel: "noreferrer" }, "Перейти →") : null,
          ])
        : null,
      el("div", { class: "profile-actions" }, [
        el("button", { class: "btn-accent", onclick: startChat }, [el("span", { html: iconSvg("Send", 16) }), " Написать"]),
        el("button", { class: "profile-action-btn", onclick: startSecretChat }, [el("span", { html: iconSvg("Lock", 14) }), " Секретный чат"]),
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
      el(
        "div",
        { class: "profile-tabs" },
        TABS.map((t) =>
          el(
            "button",
            {
              class: `profile-tab ${activeTab === t.id ? "active" : ""}`,
              onclick: () => {
                activeTab = t.id;
                render();
              },
            },
            t.label
          )
        )
      ),
      el("div", { class: "profile-tab-content" }, [renderTabContent()]),
    ];
    body.append(...children.filter(Boolean));
  }
  render();
}
