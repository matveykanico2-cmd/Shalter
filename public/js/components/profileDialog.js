import { el, clear } from "../lib/dom.js";
import { PremiumStar } from "./premiumStar.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState, updateSelf } from "../state.js";
import { openReportDialog } from "./reportDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard } from "./attachments.js";
import { statusLabel } from "../lib/presence.js";
import { SAFETY_LABELS, safetyLabelInfo } from "../lib/safetyLabels.js";
import { openAdminUserPanel } from "./adminUserPanel.js";
import { openAvatarViewer } from "./avatarViewer.js";
import { renderScene } from "../lib/animScenes.js";
import { openGiftCardDialog } from "./giftCardDialog.js";
import { openGiftShopDialog } from "./giftShopDialog.js";
import { openStoryViewer } from "./storyViewer.js";
import { giftTraits } from "../lib/giftTraits.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { openPinnedChannelsDialog } from "./pinnedChannelsDialog.js";

// Bottom tab strip, same set/order as Telegram's own profile view. Content
// for media/files/links comes from GET /api/users/:id/shared-media (scoped
// to whatever DM already exists with this user — see server/routes/users.js);
// gifts reuse the user object's own giftsReceived, already loaded with it.
const TABS = [
  { id: "media", label: "Медиа" },
  // Истории живут сутки и пропадают из ленты на «Чатах», но не из базы —
  // здесь они остаются все. Свой архив человек видит всегда, чужой — если
  // хозяин открыл его настройкой «Кто видит архив историй».
  { id: "stories", label: "Истории" },
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
// «1 история», «2 истории», «5 историй» — иначе под кружком стоит «5 история».
// Дата под плиткой архива. Год показывается только у прошлогодних: в архиве
// за эту неделю «2026» на каждой плитке — четыре лишних знака и ничего больше.
function storyDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

function storyWord(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "история";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "истории";
  return "историй";
}

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
  // Истории этого человека. Грузятся отдельным запросом и не задерживают показ
  // профиля: кнопка появляется, когда ответ придёт.
  let storiesGroup = null;
  async function loadStories() {
    try {
      ({ group: storiesGroup } = await api.getUserStories(userId));
    } catch {
      storiesGroup = null;
    }
    render();
  }
  let activeTab = "media";
  // Каналы, которые владелец профиля закрепил у себя. Приходят вместе с
  // профилем и уже проверены сервером: чужие и закрытые сюда не попадают.
  let pinnedChannels = [];
  // Архив историй грузится не сразу, а когда откроют вкладку: у человека их
  // могут быть сотни, и тянуть это на каждый просмотр профиля незачем.
  let archive = null; // null — ещё не грузили, { allowed, stories } — ответ
  let archiveLoading = false;

  async function loadArchive() {
    if (archive || archiveLoading) return;
    archiveLoading = true;
    try {
      archive = await api.getStoriesArchive(userId);
    } catch {
      archive = { allowed: false, stories: [] };
    }
    archiveLoading = false;
    render();
  }

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
    pinnedChannels = res.pinnedChannels ?? [];
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

  // Канал, на который сейчас идёт подписка, — чтобы кнопка не принимала второе
  // нажатие, пока первое не отработало.
  let joiningChannelId = null;

  function openChannel(channel) {
    close();
    navigate(`/chat/${channel.id}`);
  }

  async function joinChannel(channel) {
    joiningChannelId = channel.id;
    render();
    try {
      await api.subscribeChannel(channel.id);
      const { chats } = await api.listChats();
      setState({ chats });
      openChannel(channel);
    } catch (err) {
      joiningChannelId = null;
      render();
      alert(err.message || "Не удалось подписаться");
    }
  }

  function openChannelsPicker() {
    openPinnedChannelsDialog({
      pinned: pinnedChannels,
      onSaved: (next) => {
        pinnedChannels = next ?? [];
        render();
      },
    });
  }

  async function toggleBlock() {
    await api.setBlocked(userId, !isBlocked);
    isBlocked = !isBlocked;
    const blockedUserIds = new Set(getState().user.blockedUserIds ?? []);
    if (isBlocked) blockedUserIds.add(userId);
    else blockedUserIds.delete(userId);
    updateSelf({ blockedUserIds: [...blockedUserIds] });
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
      // Сетка карточек вместо строки крошечных фишек: подарок — вещь, у которой
      // есть вид, номер и цена, а фишка размером с эмодзи не показывала ничего
      // из этого. По нажатию открывается карточка экземпляра со свойствами
      // (components/giftCardDialog.js).
      return el(
        "div",
        { class: "profile-gifts-grid" },
        gifts
          .slice()
          .reverse()
          .map((g) => {
            const from = g.fromName ? ` · от ${g.fromName}` : "";
            const entryId = g.id ?? `${g.emoji}|${g.at}`;
            const traits = giftTraits(g);
            const [c1, c2] = traits.backdrop.colors;
            return el(
              "button",
              {
                class: `profile-gift-card ${g.serial != null ? "profile-gift-card-exclusive" : ""}`,
                style: `--gift-from: ${c1}; --gift-to: ${c2}`,
                title: g.serial != null ? `${g.name} — №${g.serial} из ${g.supply}${from}` : `${g.name}${from}`,
                onclick: () =>
                  openGiftCardDialog(g, {
                    ownerName: user.name,
                    // «Отправить такой же» — то, ради чего чаще всего и
                    // открывают чужой подарок.
                    onSend: () => openGiftShopDialog({ recipient: { id: user.id, name: user.name } }),
                    onRemove: isSelf ? () => removeGift(entryId, g) : undefined,
                  }),
              },
              [
                g.serial != null ? el("span", { class: "profile-gift-ribbon" }, `№${g.serial}`) : null,
                el("span", { class: "profile-gift-art" }, [renderScene(g.emoji, { size: 44, replay: false })]),
                el("span", { class: "profile-gift-title" }, g.name),
                el("span", { class: "profile-gift-price" }, `⭐ ${Number(g.priceStars ?? 0).toLocaleString("ru-RU")}`),
              ].filter(Boolean)
            );
          })
      );
    }
    if (activeTab === "stories") {
      if (archiveLoading || archive === null) {
        loadArchive();
        return el("div", { class: "qr-login-spinner" });
      }
      if (!archive.allowed) {
        return el("p", { class: "profile-empty-tab" }, "Архив историй закрыт");
      }
      if (!archive.stories.length) {
        return el("p", { class: "profile-empty-tab" }, isSelf ? "Вы ещё не выкладывали историй" : "Историй пока нет");
      }
      // Плитка на каждый кадр, а не на историю: в одной истории их может быть
      // до десяти, и показывать десять снимков одной обложкой значит прятать
      // девять. Открывается просмотрщик с того кадра, по которому нажали.
      const frames = archive.stories.flatMap((story) =>
        (story.items?.length ? story.items : [{ kind: story.kind, url: story.url }]).map((item, index) => ({ story, item, index }))
      );
      return el("div", { class: "profile-stories-grid" }, [
        ...frames.map(({ story, item, index }) =>
          el(
            "button",
            {
              class: `profile-story-cell ${story.expired ? "expired" : ""} ${story.viewed ? "viewed" : ""}`,
              title: story.expired ? `Истекла ${storyDate(story.createdAt)}` : `Ещё в ленте · ${storyDate(story.createdAt)}`,
              onclick: () =>
                openStoryViewer(
                  [{ user, stories: [story] }],
                  0,
                  me.id,
                  () => {
                    // Историю могли удалить прямо из просмотрщика — тогда
                    // архив надо перечитать, а не оставлять плитку, за которой
                    // уже ничего нет.
                    archive = null;
                    render();
                  },
                  index
                ),
            },
            [
              item.kind === "video"
                ? el("video", { class: "profile-story-cell-media", src: item.url, muted: true })
                : el("img", { class: "profile-story-cell-media", src: item.url, alt: "" }),
              item.kind === "video" ? el("span", { class: "profile-story-cell-play", html: iconSvg("Play", 14) }) : null,
              el("span", { class: "profile-story-date" }, storyDate(story.createdAt)),
            ].filter(Boolean)
          )
        ),
      ]);
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
        user.isPremium ? PremiumStar({ size: 18, seed: user.id, title: "Shalter Premium" }) : null,
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
      user.username
        ? el("p", { class: `profile-username ${user.isCollectibleUsername ? "collectible" : ""}` }, [
            `@${user.username}`,
            // Won at auction, not merely registered first — that's the whole
            // point of a collectible handle, so it has to be visible.
            user.isCollectibleUsername
              ? el("span", { class: "collectible-badge", title: "Коллекционный юзернейм — выигран на аукционе" }, "💎")
              : null,
          ].filter(Boolean))
        : null,
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
        // Подарок отправляют из профиля того, кому дарят, — там же, где на него
        // и смотрят. Раньше до магазина надо было идти через меню чата, зная,
        // что он там есть.
        !isSelf
          ? el(
              "button",
              { class: "profile-action-btn", onclick: () => openGiftShopDialog({ recipient: { id: user.id, name: user.name } }) },
              [el("span", { html: iconSvg("Gift", 15) }), " Отправить подарок"]
            )
          : null,
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
      // Каналы человека. Показываются всем, кто открыл профиль, — в этом и
      // смысл: «вот что я веду, подпишись». Свой профиль вдобавок показывает
      // кнопку изменения — и её же, отдельной строкой-приглашением, когда
      // закреплять ещё нечего.
      pinnedChannels.length || isSelf
        ? el("div", { class: "profile-channels" }, [
            el("div", { class: "profile-channels-head" }, [
              el("p", { class: "profile-section-title" }, "Каналы"),
              isSelf
                ? el(
                    "button",
                    { class: "profile-channels-edit", onclick: openChannelsPicker },
                    pinnedChannels.length ? "Изменить" : "Выбрать"
                  )
                : null,
            ]),
            ...(pinnedChannels.length
              ? pinnedChannels.map((c) =>
                  el("div", { class: "profile-channel-row" }, [
                    Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 38 }),
                    el("div", { class: "profile-channel-body" }, [
                      el("p", { class: "profile-channel-title" }, [c.title, c.isVerified ? VerifiedBadge(13) : null]),
                      el("p", { class: "profile-channel-sub" }, c.username ? `@${c.username}` : `${c.members} подписчиков`),
                    ]),
                    // Подписчику — «Открыть», остальным — «Подписаться».
                    // Просто вести всех на /chat/:id нельзя: этот адрес требует
                    // участия в чате, и посторонний упирался бы в отказ сервера
                    // уже после нажатия. Подписка здесь делает ровно то же, что
                    // в каталоге каналов: подписывает и открывает.
                    el(
                      "button",
                      {
                        class: c.isMember ? "profile-channel-open" : "btn-accent-pill",
                        disabled: joiningChannelId === c.id,
                        onclick: () => (c.isMember ? openChannel(c) : joinChannel(c)),
                      },
                      c.isMember ? "Открыть" : joiningChannelId === c.id ? "Подписываем…" : "Подписаться"
                    ),
                  ])
                )
              : [el("p", { class: "settings-toggle-hint" }, "Закрепите свои публичные каналы — их увидит каждый, кто откроет ваш профиль.")]),
          ])
        : null,
      // Истории человека: сверху кружок с обводкой — как в ленте, — а сразу под
      // ним все его истории плитками. Кружок открывает с первой, плитка — с
      // той, по которой нажали.
      storiesGroup
        ? el("div", { class: "profile-stories" }, [
            el("div", { class: "profile-stories-head" }, [
              el(
                "button",
                {
                  class: "profile-stories-circle",
                  title: "Смотреть истории",
                  onclick: () => openStoryViewer([storiesGroup], 0, me.id, () => loadStories()),
                },
                [
                  el("span", {
                    class: `story-avatar-ring ${storiesGroup.stories.some((st) => !st.viewed) ? "unseen" : "seen"}`,
                  }),
                  storiesGroup.stories[0].kind === "video"
                    ? el("video", { class: "profile-stories-thumb", src: storiesGroup.stories[0].url, muted: true })
                    : el("img", { class: "profile-stories-thumb", src: storiesGroup.stories[0].url, alt: "" }),
                ]
              ),
              el("div", {}, [
                el("p", { class: "profile-stories-title" }, "Истории"),
                el("p", { class: "profile-stories-sub" }, `${storiesGroup.stories.length} ${storyWord(storiesGroup.stories.length)}`),
              ]),
            ]),
            el(
              "div",
              { class: "profile-stories-grid" },
              // По плитке на кадр, а не на историю: история теперь может быть
              // из нескольких снимков, и показывать её одной обложкой значило
              // бы прятать остальные. Просмотрщик листает те же кадры подряд,
              // поэтому его начальный номер — это номер плитки в этой сетке.
              storiesGroup.stories
                .flatMap((st) => (st.items?.length ? st.items : [{ kind: st.kind, url: st.url }]).map((item) => ({ st, item })))
                .map(({ st, item }, i) =>
                  el(
                    "button",
                    {
                      class: `profile-story-cell ${st.viewed ? "viewed" : ""}`,
                      onclick: () => openStoryViewer([storiesGroup], 0, me.id, () => loadStories(), i),
                    },
                    [
                      item.kind === "video"
                        ? el("video", { class: "profile-story-cell-media", src: item.url, muted: true })
                        : el("img", { class: "profile-story-cell-media", src: item.url, alt: "" }),
                      item.kind === "video" ? el("span", { class: "profile-story-cell-play", html: iconSvg("Play", 14) }) : null,
                    ]
                  )
                )
            ),
          ])
        : null,

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
  loadStories();
}
