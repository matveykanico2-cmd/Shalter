import { el, clear } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openReportDialog } from "./reportDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard } from "./attachments.js";
import { statusLabel } from "../lib/presence.js";
import { SAFETY_LABELS, safetyLabelInfo } from "../lib/safetyLabels.js";
import { openAdminUserPanel } from "./adminUserPanel.js";
import { openAvatarViewer } from "./avatarViewer.js";
import { renderScene } from "../lib/animScenes.js";
import { VerifiedBadge } from "./verifiedBadge.js";

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

  // Ban/label changes made from the admin panel are reflected right here
  // (badge, warning banner) instead of needing the profile reopened.
  function onAdminChange(patch) {
    user = { ...user, ...patch };
    render();
  }

  const isSelf = userId === me.id;

  // Removing a gift is destructive and irreversible from the UI's point of view
  // (the shelf entry is gone), so it asks first — and says plainly that the
  // serial isn't freed, because that's the part someone might reasonably assume.
  async function removeGift(entryId, gift) {
    const serialNote = gift.serial != null ? ` Номер №${gift.serial} останется занятым.` : "";
    if (!confirm(`Убрать ${gift.emoji} «${gift.name}» с вашей полки?${serialNote}`)) return;
    try {
      const { user: updated } = await api.removeReceivedGift(entryId);
      user = { ...user, giftsReceived: updated.giftsReceived ?? [] };
      render();
    } catch (err) {
      alert(err.message || "Не удалось убрать подарок");
    }
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
          // A limited gift (server/data/gifts.js's exclusive tier) carries
          // the serial it was minted with — worth surfacing on the shelf
          // too, since "#1 из 10" is the whole reason someone bought it.
          .map((g) => {
            // The sender belongs in the tooltip: the shelf is a row of small
            // chips, and "от кого" is the thing people actually want from it.
            const from = g.fromName ? ` · от ${g.fromName}` : "";
            // Entries added before shelf ids existed fall back to emoji+time,
            // matching what the server accepts (see data/users.js).
            const entryId = g.id ?? `${g.emoji}|${g.at}`;
            const chip = el(
              "span",
              {
                class: `profile-gift-chip ${g.serial != null ? "profile-gift-chip-exclusive" : ""}`,
                title: g.serial != null ? `${g.name} — №${g.serial} из ${g.supply}${from}` : `${g.name}${from}`,
              },
              [
                renderScene(g.emoji, { size: 22, replay: false }),
                g.serial != null ? el("span", { class: "profile-gift-serial" }, `№${g.serial}`) : null,
                // Only on your own shelf: a gift is part of your profile, and
                // nobody else gets to tidy it.
                isSelf
                  ? el("button", {
                      class: "profile-gift-remove",
                      title: "Убрать с полки",
                      html: iconSvg("X", 10),
                      onclick: () => removeGift(entryId, g),
                    })
                  : null,
              ]
            );
            return chip;
          })
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
    const safety = safetyLabelInfo(user.safetyLabel);
    // Plain Element.append() (unlike dom.js's el()/mount()) stringifies null
    // arguments into literal "null" text nodes — filter them out first.
    const children = [
      el("div", { class: "profile-avatar-row" }, [
        // Tapping opens it full-size, with any other photos this person has
        // behind it. On your own profile the same viewer manages the list.
        el(
          "button",
          {
            class: "avatar-open-btn",
            title: "Открыть фото",
            onclick: () =>
              openAvatarViewer(user, {
                canEdit: isSelf,
                onChange: (updated) => {
                  user = { ...user, ...updated };
                  render();
                },
              }),
          },
          [
            Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, size: 88, online: user.online, isPremium: user.isPremium, isDeveloper: user.isDeveloper, orbit: true }),
            (user.avatarImages ?? []).length > 1
              ? el("span", { class: "avatar-count-badge" }, String(user.avatarImages.length))
              : null,
          ].filter(Boolean)
        ),
      ]),
      el("p", { class: "profile-name" }, [
        user.name || "Без имени",
        VerifiedBadge(user, 17),
        user.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
        user.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
        safety ? el("span", { class: `safety-badge safety-${user.safetyLabel}`, title: safety.label }, safety.short) : null,
      ]),
      // The warning itself, not just the badge — a three-letter tag next to a
      // name is easy to skim past, and the person who most needs this is the
      // one being actively worked by whoever owns the account.
      safety
        ? el("div", { class: `safety-warning safety-${user.safetyLabel}` }, [
            el("span", { html: iconSvg("Info", 15) }),
            el("div", {}, [el("p", { class: "safety-warning-title" }, safety.label), el("p", { class: "safety-warning-hint" }, safety.hint)]),
          ])
        : null,
      user.isBanned ? el("p", { class: "safety-banned-note" }, "🚫 Аккаунт заблокирован администрацией Shalter") : null,
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
      // Admin tools, on the profile of whoever you're looking at rather than
      // only on a separate Settings screen where you'd have to re-find the
      // person by handle first. Gated on me.isDeveloper for the UI; every
      // action behind it is gated again server-side (routes/admin.js).
      me.isDeveloper && user.id !== me.id
        ? el("div", { class: "profile-admin-block" }, [
            el("p", { class: "profile-admin-title" }, [el("span", { html: iconSvg("Shield", 13) }), " Инструменты разработчика"]),
            el("button", { class: "profile-action-btn", onclick: () => openAdminUserPanel(user, onAdminChange) }, [
              el("span", { html: iconSvg("Shield", 14) }),
              " Выдать покупку, модерация, данные",
            ]),
          ])
        : null,
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
