import { askText } from "./confirmDialog.js";
import { askConfirm } from "./confirmDialog.js";
import { el, clear } from "../lib/dom.js";
import { PremiumStar } from "./premiumStar.js";
import { Avatar, videoAvatarUrl } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { openAd } from "../lib/adLink.js";
import { api } from "../api.js";
import { onWsMessage } from "../lib/wsClient.js";
import { navigate } from "../router.js";
import { getState, setState, updateSelf } from "../state.js";
import { openReportDialog } from "./reportDialog.js";
import { ImageAttachment, VideoAttachment, FileAttachment, LinkPreviewCard } from "./attachments.js";
import { statusLabel, plural } from "../lib/presence.js";
import { placeCall } from "../lib/callController.js";
import { openForwardDialog } from "./forwardDialog.js";
import { openProfileQrDialog } from "./profileQrDialog.js";
import { SAFETY_LABELS, safetyLabelInfo } from "../lib/safetyLabels.js";
import { openAdminUserPanel } from "./adminUserPanel.js";
import { openAvatarViewer } from "./avatarViewer.js";
import { openGiftCardDialog } from "./giftCardDialog.js";
import { openGiftShopDialog } from "./giftShopDialog.js";
import { openStoryViewer } from "./storyViewer.js";
import { giftTraits, renderGiftArt } from "../lib/giftTraits.js";
import { giftBackgroundStyle } from "../lib/giftBackground.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { ProfileStatusBadge } from "./profileStatusBadge.js";
import { openPinnedChannelsDialog } from "./pinnedChannelsDialog.js";
import { DAY_KEYS, DAY_LABELS, formatDayHours, formatStatus, browserTimeZone } from "../lib/businessHours.js";

const TABS = [
  { id: "media", label: "Медиа" },
  { id: "stories", label: "Истории" },
  { id: "gifts", label: "Подарки" },
  { id: "files", label: "Файлы" },
  { id: "links", label: "Ссылки" },
  { id: "voice", label: "Голосовые и видео" },
  { id: "groups", label: "Группы" },
];

export async function copyText(text, note = "Скопировано") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    (await askText("Скопируйте вручную:", text));
    return;
  }
  showToast(note);
}

function showToast(text) {
  const toast = el("div", { class: "profile-copy-toast" }, text);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);
}

function quickAction(icon, label, onClick) {
  return el("button", { class: "profile-quick-action", onclick: onClick }, [
    el("span", { class: "profile-quick-action-icon", html: iconSvg(icon, 20) }),
    el("span", { class: "profile-quick-action-label" }, label),
  ]);
}

export function infoRow({ icon, value, label, mono, accent, multiline, copy, onClick }) {
  const clickable = !!(copy || onClick);
  return el(
    clickable ? "button" : "div",
    {
      class: `profile-info-row${clickable ? " clickable" : ""}`,
      title: copy ? "Нажмите, чтобы скопировать" : "",
      onclick: clickable ? () => (onClick ? onClick() : copyText(copy, `${label}: скопировано`)) : null,
    },
    [
      el("span", { class: "profile-info-row-icon", html: iconSvg(icon, 24) }),
      el("span", { class: "profile-info-row-body" }, [
        el("span", { class: `profile-info-row-value${mono ? " mono" : ""}${accent ? " accent" : ""}${multiline ? " multiline" : ""}` }, value),
        el("span", { class: "profile-info-row-label" }, label),
      ]),
    ]
  );
}

// Часы работы как в tweb (businessHours.tsx): «Открыто»/«Закрыто» цветом, сегодня справа,
// по нажатию — вся неделя, начиная с сегодняшнего дня.
function businessHoursRow(bh) {
  const todayIdx = (new Date().getDay() + 6) % 7;
  const order = [...DAY_KEYS.slice(todayIdx), ...DAY_KEYS.slice(0, todayIdx)];
  const allDay = DAY_KEYS.every((k) => bh.hours[k] && !bh.hours[k].closed && bh.hours[k].open === "00:00" && bh.hours[k].close === "24:00");
  const statusText = formatStatus(bh.status, bh.hours).replace(/^(Открыто|Закрыто)( · )?/, "");
  const details = el("div", { class: "tw-bhours" }, [
    ...order.map((k, i) =>
      el("div", { class: "tw-bhours-row" }, [
        el("span", { class: "tw-bhours-day" }, i === 0 ? "Сегодня" : DAY_LABELS[k]),
        el("span", { class: "tw-bhours-time" }, formatDayHours(bh.hours[k])),
      ])
    ),
    bh.timeZone && bh.timeZone !== browserTimeZone()
      ? el("p", { class: "tw-bhours-tz" }, `Время по поясу ${bh.timeZone.replace(/_/g, " ")}`)
      : null,
  ]);
  const row = el("button", { type: "button", class: "profile-info-row clickable tw-bhours-container", onclick: () => !allDay && row.classList.toggle("is-expanded") }, [
    el("span", { class: "profile-info-row-icon", html: iconSvg("Clock", 24) }),
    el("span", { class: "profile-info-row-body" }, [
      el("span", { class: `profile-info-row-value tw-bhours-status ${bh.status.open ? "open" : "closed"}` }, bh.status.open ? "Открыто" : "Закрыто"),
      el("span", { class: "tw-bhours-sub" }, [
        el("span", { class: "profile-info-row-label" }, "Часы работы"),
        el("span", { class: "profile-info-row-label tw-bhours-right" }, allDay ? "круглосуточно" : statusText || formatDayHours(bh.hours[order[0]])),
      ]),
      allDay ? null : details,
    ]),
  ]);
  return row;
}

// Адрес бизнеса (tweb .business-location): нажатие открывает карту, без координат — копирует.
function businessLocationRow(user) {
  const hasGeo = typeof user.businessLat === "number" && typeof user.businessLng === "number";
  return infoRow({
    icon: "MapPin",
    value: user.businessAddress,
    label: "Местоположение",
    multiline: true,
    onClick: async () => {
      if (!hasGeo) return copyText(user.businessAddress, "Адрес скопирован");
      if (await askConfirm("Открыть адрес на карте?", { okLabel: "Открыть" })) {
        window.open(`https://yandex.ru/maps/?pt=${user.businessLng},${user.businessLat}&z=17&l=map`, "_blank", "noopener");
      }
    },
  });
}

export function birthdayText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const now = new Date();
  let age = now.getFullYear() - d.getUTCFullYear();
  const beforeBirthday = now.getMonth() < d.getUTCMonth() || (now.getMonth() === d.getUTCMonth() && now.getDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? `${date} (${age} ${plural(age, "год", "года", "лет")})` : date;
}

export function isBirthdayToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === now.getMonth() && d.getUTCDate() === now.getDate();
}

function mediaDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

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

  function onKey(e) {
    if (e.key !== "Escape" || !overlay.isConnected) return;
    if (overlay.nextElementSibling) return;
    close();
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("shalter:messages-deleted", onLocalDelete);
    unsubDeleted();
    overlay.remove();
  }
  document.addEventListener("keydown", onKey);

  let user, inContacts, contactName, contactNote, isBlocked;
  let sharedMedia = { chatId: null, media: [], files: [], links: [], voice: [] };
  // Удалили сообщение в чате — оно пропадает из «Медиа», «Голосовых», «Файлов», «Ссылок».
  function dropShared(chatId, ids) {
    if (!sharedMedia.chatId || chatId !== sharedMedia.chatId) return;
    const gone = new Set(ids);
    const keep = (list) => (list ?? []).filter((x) => !gone.has(x.messageId));
    sharedMedia = {
      ...sharedMedia,
      media: keep(sharedMedia.media),
      files: keep(sharedMedia.files),
      links: keep(sharedMedia.links),
      voice: keep(sharedMedia.voice),
    };
    if (user) render();
  }
  const onLocalDelete = (e) => dropShared(e.detail?.chatId, e.detail?.ids ?? []);
  window.addEventListener("shalter:messages-deleted", onLocalDelete);
  const unsubDeleted = onWsMessage("message:deleted", (msg) => dropShared(msg.chatId, [msg.id]));
  let commonGroupsCount = 0;
  let commonGroups = null;
  let storiesGroup = null;
  async function loadStories() {
    try {
      ({ group: storiesGroup } = await api.getUserStories(userId));
    } catch {
      storiesGroup = null;
    }
    render();
  }
  // An ad campaign this user runs with the "profile" placement.
  let campaignAd = null;
  async function loadCampaignAd() {
    try {
      ({ ad: campaignAd } = await api.serveAd("profile", userId));
    } catch {
      campaignAd = null;
    }
    if (campaignAd) render();
  }
  let activeTab = "media";
  let hoursExpanded = false;
  let pinnedChannels = [];
  let archive = null;
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
        .catch(() => {}),
    ]);
    user = res.user;
    inContacts = !!res.inContacts;
    contactName = res.contactName ?? null;
    contactNote = res.contactNote ?? null;
    commonGroupsCount = res.commonGroupsCount ?? 0;
    pinnedChannels = res.pinnedChannels ?? [];
    isBlocked = !!me.blockedUserIds?.includes(userId);
  } catch (err) {
    clear(body);
    body.appendChild(el("p", { class: "login-error center" }, err.message || "Не удалось загрузить профиль"));
    return;
  }

  function onAdminChange(patch) {
    user = { ...user, ...patch };
    render();
  }

  const isSelf = userId === me.id;

  async function removeGift(entryId, gift) {
    const serialNote = gift.serial != null ? ` Номер №${gift.serial} останется занятым.` : "";
    if (!(await askConfirm(`Убрать ${gift.emoji} «${gift.name}» с вашей полки?${serialNote}`))) return;
    try {
      const { user: updated } = await api.removeReceivedGift(entryId);
      user = { ...user, giftsReceived: updated.giftsReceived ?? [] };
      render();
    } catch (err) {
      alert(err.message || "Не удалось убрать подарок");
    }
  }

  async function toggleGiftPin(entryId, gift) {
    try {
      const { user: updated } = await api.setGiftPinned(entryId, !gift.pinned);
      user = { ...user, giftsReceived: updated.giftsReceived ?? [] };
      render();
    } catch (err) {
      alert(err.message || "Не удалось закрепить подарок");
    }
  }

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

  async function toggleContact() {
    if (inContacts && !(await askConfirm(`Удалить ${user.name} из контактов?`))) return;
    try {
      if (inContacts) await api.removeContact(userId);
      else await api.addContact(userId, null, { sharePhone: !user.isBot && (await askConfirm(`Поделиться своим номером телефона с ${user.name}?`, { okLabel: "Поделиться", cancelLabel: "Не делиться" })) });
      inContacts = !inContacts;
      render();
    } catch (err) {
      alert(err.message || "Не удалось изменить контакт");
    }
  }

  async function editNote() {
    const next = (await askText("Заметка о контакте — её видите только вы. Пусто — удалить.", contactNote ?? ""));
    if (next === null) return;
    try {
      const res = await api.setContactNote(user.id, next);
      contactNote = res.note ?? null;
      render();
    } catch (err) {
      alert(err.message || "Не удалось сохранить заметку");
    }
  }

  async function startChat() {
    try {
      const { chat } = await api.startDm(userId, user.name, user.avatarColor);
      close();
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      alert(err.message || "Не удалось открыть чат");
    }
  }

  async function startSecretChat() {
    if (!(await askConfirm(`Начать секретный чат с ${user.name}?\n\nСообщения шифруются отдельным ключом этого чата, их нельзя переслать или скопировать. Чат будет доступен только на этом устройстве.`))) return;
    try {
      const { chat } = await api.startSecretChat(userId);
      api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
      close();
      navigate(`/chat/${chat.id}`);
    } catch (err) {
      alert(err.message || "Не удалось начать секретный чат");
    }
  }

  async function call(kind) {
    try {
      const { chat } = await api.startDm(userId, user.name, user.avatarColor);
      close();
      await placeCall(chat.id, kind, me);
    } catch (err) {
      alert(err.message || "Не удалось позвонить");
    }
  }

  const profileLink = () => `${location.origin}/u/${user.username}`;

  function shareContact() {
    openForwardDialog(async (chatId) => {
      try {
        await api.sendMessage(chatId, "", {
          attachments: [{ kind: "contact", meta: { userId: user.id, name: user.name, phone: user.phone } }],
        });
        showToast("Контакт отправлен");
      } catch (err) {
        alert(err.message || "Не удалось отправить контакт");
      }
    });
  }

  async function loadCommonGroups() {
    try {
      ({ chats: commonGroups } = await api.getCommonChats(userId));
    } catch {
      commonGroups = [];
    }
    render();
  }

  function visibleTabs() {
    const has = {
      media: sharedMedia.media.length > 0,
      stories: !user.isBot,
      gifts: (user.giftsReceived ?? []).length > 0,
      files: sharedMedia.files.length > 0,
      links: sharedMedia.links.length > 0,
      voice: (sharedMedia.voice ?? []).length > 0,
      groups: commonGroupsCount > 0,
    };
    return TABS.filter((t) => has[t.id]);
  }

  function renderTabContent() {
    if (activeTab === "gifts") {
      const gifts = user.giftsReceived ?? [];
      if (!gifts.length) return el("p", { class: "profile-empty-tab" }, "Подарков пока нет");
      const ordered = gifts
        .slice()
        .reverse()
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      // Сетка подарков как StarGiftsGrid (view: profile) в tweb: плитка на фоне поверхности,
      // аватар дарителя в углу, номер — в уголке-ленте, фон-узор только у эксклюзивных.
      return el(
        "div",
        { class: "tw-gifts-grid" },
        ordered.map((g) => {
          const from = g.fromName ? ` · от ${g.fromName}` : "";
          const entryId = g.id ?? `${g.emoji}|${g.at}`;
          const exclusive = g.serial != null;
          const [c1, c2] = giftTraits(g).backdrop.colors;
          const backdrop = g.background ? giftBackgroundStyle(g.background) : exclusive ? `radial-gradient(circle at 50% 40%, ${c1}, ${c2})` : null;
          const fromBadge = g.pinned
            ? el("span", { class: "tw-gift-pin", title: "Закреплён", html: iconSvg("Pin", 14) })
            : g.anon || !g.fromId
              ? el("span", { class: "tw-gift-sender tw-gift-sender-anon", title: g.fromName ?? "Аноним" }, "?")
              : el("span", { class: "tw-gift-sender", title: g.fromName ?? "" }, [Avatar({ name: g.fromName ?? "?", size: 20 })]);
          return el(
            "button",
            {
              type: "button",
              class: `tw-gift-item${backdrop ? " tw-gift-item-backdrop" : ""}`,
              style: `--gift-overlay: ${c2};${backdrop ? ` background: ${backdrop};` : ""}`,
              title: exclusive ? `${g.name} — №${g.serial} из ${g.supply}${from}` : `${g.name}${from}`,
              "aria-label": g.name,
              onclick: () =>
                openGiftCardDialog(g, {
                  ownerName: user.name,
                  onSend: () => openGiftShopDialog({ recipient: isSelf ? null : { id: user.id, name: user.name }, gift: g }),
                  onRemove: isSelf ? () => removeGift(entryId, g) : undefined,
                  onTogglePin: isSelf ? () => toggleGiftPin(entryId, g) : undefined,
                }),
            },
            [
              fromBadge,
              exclusive
                ? el("span", { class: "tw-gift-badge", style: { background: `linear-gradient(180deg, ${c1} 0%, ${c2} 100%)` } }, [
                    el("span", { class: "tw-gift-badge-text" }, g.pinned ? `#${g.serial}` : `1 из ${Number(g.supply).toLocaleString("ru-RU")}`),
                  ])
                : null,
              el("span", { class: "tw-gift-sticker" }, [renderGiftArt(g, { size: 72, replay: false })]),
              el("span", { class: "tw-gift-price" }, [
                el("span", { class: "tw-gift-star" }, "⭐"),
                Number(g.priceStars ?? 0).toLocaleString("ru-RU"),
              ]),
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

    if (activeTab === "voice") {
      const items = sharedMedia.voice ?? [];
      if (!items.length) return el("p", { class: "profile-empty-tab" }, "Голосовых пока нет");
      return el(
        "div",
        { class: "profile-voice-list" },
        items.map((v) =>
          el("div", { class: "profile-voice-row" }, [
            el("span", { class: "profile-voice-meta" }, [
              v.attachment.kind === "video-note" ? "Видеосообщение" : "Голосовое",
              v.attachment.durationSec ? ` · ${Math.round(v.attachment.durationSec)} с` : "",
              ` · ${mediaDate(v.createdAt)}`,
            ].join("")),
            v.attachment.kind === "video-note"
              ? el("video", { class: "profile-voice-note", src: v.attachment.url, controls: true, preload: "metadata", playsInline: true })
              : el("audio", { class: "profile-voice-player", src: v.attachment.url, controls: true, preload: "none" }),
          ])
        )
      );
    }
    if (activeTab === "groups") {
      if (commonGroups === null) {
        loadCommonGroups();
        return el("div", { class: "qr-login-spinner" });
      }
      if (!commonGroups.length) return el("p", { class: "profile-empty-tab" }, "Общих групп нет");
      return el(
        "div",
        { class: "profile-groups-list" },
        commonGroups.map((g) =>
          el(
            "button",
            {
              class: "profile-channel-row profile-group-row",
              onclick: () => {
                close();
                navigate(`/chat/${g.id}`);
              },
            },
            [
              Avatar({ name: g.title, color: g.avatarColor, image: g.avatarImage, size: 38 }),
              el("div", { class: "profile-channel-body" }, [
                el("p", { class: "profile-channel-title" }, g.title),
                el("p", { class: "profile-channel-sub" }, `${g.members} ${plural(g.members, "участник", "участника", "участников")}`),
              ]),
            ]
          )
        )
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
    const status =
      user.isBot && typeof user.botUserCount === "number"
        ? `бот · ${user.botUserCount.toLocaleString("ru-RU")} ${plural(user.botUserCount, "пользователь", "пользователя", "пользователей")}`
        : statusLabel(user);
    const tabs = visibleTabs();
    if (!tabs.some((t) => t.id === activeTab)) activeTab = (tabs.find((t) => t.id !== "stories") ?? tabs[0])?.id ?? "stories";
    const safety = safetyLabelInfo(user.safetyLabel);
    const children = [
      el("div", { class: "profile-avatar-row" }, [
        el(
          "button",
          {
            class: "avatar-open-btn",
            title: isSelf || user.avatarImage ? "Открыть фото" : "",
            onclick: () =>
              (isSelf || user.avatarImage) &&
              openAvatarViewer(user, {
                canEdit: isSelf,
                onChange: (updated) => {
                  user = { ...user, ...updated };
                  render();
                },
              }),
          },
          [
            Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, video: videoAvatarUrl(user), size: 88, online: user.online, isPremium: user.isPremium, isDeveloper: user.isDeveloper, orbit: true }),
            (user.avatarImages ?? []).length > 1
              ? el("span", { class: "avatar-count-badge" }, String(user.avatarImages.length))
              : null,
          ].filter(Boolean)
        ),
      ]),
      isSelf ? el("p", { class: "profile-self-hint" }, "Так ваш профиль видят другие") : null,
      el("p", { class: "profile-name" }, [
        user.name || "Без имени",
        VerifiedBadge(user, 17),
        user.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
        user.isPremium ? PremiumStar({ size: 18, seed: user.id, title: "Shalter Premium" }) : null,
        ProfileStatusBadge(user, 18),
        safety ? el("span", { class: `safety-badge safety-${user.safetyLabel}`, title: safety.label }, safety.short) : null,
      ]),
      el("p", { class: `profile-status${user.online ? " online" : ""}` }, status ?? "был(а) недавно"),
      // Имя уже показано так, как вы записали человека; его собственное — подсказкой.
      user.profileName ? el("p", { class: "profile-contact-name" }, `Имя в профиле: ${user.profileName}`) : null,
      user.mutualContact ? el("p", { class: "profile-contact-name" }, "⇄ Взаимный контакт") : null,
      safety
        ? el("div", { class: `safety-warning safety-${user.safetyLabel}` }, [
            el("span", { html: iconSvg("Info", 15) }),
            el("div", {}, [el("p", { class: "safety-warning-title" }, safety.label), el("p", { class: "safety-warning-hint" }, safety.hint)]),
          ])
        : null,
      user.isBanned ? el("p", { class: "safety-banned-note" }, "🚫 Аккаунт заблокирован администрацией Shalter") : null,
      el(
        "div",
        { class: "profile-quick-actions" },
        [
          quickAction(isSelf ? "Bookmark" : "MessageSquare", isSelf ? "Избранное" : "Написать", startChat),
          !isSelf && !user.isBot && !isBlocked ? quickAction("Phone", "Звонок", () => call("audio")) : null,
          !isSelf && !user.isBot && !isBlocked ? quickAction("Video", "Видео", () => call("video")) : null,
          user.username ? quickAction("Copy", "Ссылка", () => copyText(profileLink(), "Ссылка на профиль скопирована")) : null,
          isSelf && user.username ? quickAction("Qrcode", "QR-код", () => openProfileQrDialog(user)) : null,
          isSelf
            ? quickAction("Edit", "Изменить", () => {
                close();
                navigate("/settings/profile");
              })
            : null,
        ].filter(Boolean)
      ),
      el(
        "div",
        { class: "profile-info-card" },
        [
          user.phone ? infoRow({ icon: "Phone", value: user.phone, label: "Телефон", mono: true, copy: user.phone }) : null,
          user.username
            ? infoRow({
                icon: "At",
                value: [
                  `@${user.username}`,
                  user.isCollectibleUsername
                    ? el("span", { class: "collectible-badge", title: "Коллекционный юзернейм — выигран на аукционе" }, "💎")
                    : null,
                ].filter(Boolean),
                label: "Имя пользователя",
                copy: `@${user.username}`,
              })
            : null,
          user.bio ? infoRow({ icon: "Info", value: user.bio, label: user.isBot ? "Описание" : "О себе", multiline: true }) : null,
          inContacts && !isSelf
            ? infoRow({
                icon: "Edit",
                value: contactNote || "Добавить заметку",
                label: "Заметка · видите только вы",
                accent: !contactNote,
                multiline: !!contactNote,
                onClick: editNote,
              })
            : null,
          user.birthday
            ? infoRow({
                icon: "Gift",
                value: isBirthdayToday(user.birthday) ? `🎉 Сегодня день рождения · ${birthdayText(user.birthday)}` : birthdayText(user.birthday),
                label: "День рождения",
              })
            : null,
          commonGroupsCount > 0
            ? infoRow({
                icon: "Users",
                value: `${commonGroupsCount} ${plural(commonGroupsCount, "общая группа", "общие группы", "общих групп")}`,
                label: "Общие группы",
                onClick: () => {
                  activeTab = "groups";
                  render();
                  body.querySelector(".profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
                },
              })
            : null,
        ].filter(Boolean)
      ),
      user.profileTrack
        ? el("div", { class: "profile-track-row" }, [
            el("span", { class: "profile-track-icon", html: iconSvg("Volume", 15) }),
            el("audio", { class: "profile-track-player", controls: true, preload: "none", src: user.profileTrack.url }),
          ])
        : null,
      user.businessHours || (user.isBusiness && user.businessAddress)
        ? el("div", { class: "profile-info-card" }, [
            user.businessHours ? businessHoursRow(user.businessHours) : null,
            user.isBusiness && user.businessAddress ? businessLocationRow(user) : null,
          ])
        : null,
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
      campaignAd
        ? el("button", { class: "profile-ad-banner", title: campaignAd.url || "", onclick: () => {
              close();
              openAd(campaignAd);
            } }, [
            el("span", { class: "profile-ad-label" }, "Реклама"),
            campaignAd.title ? el("p", { class: "profile-ad-text" }, el("b", {}, campaignAd.title)) : null,
            el("p", { class: "profile-ad-text" }, campaignAd.text),
          ])
        : null,
      !isSelf
        ? el(
            "div",
            { class: "profile-actions" },
            [
              !user.isBot
                ? el(
                    "button",
                    { class: "profile-action-btn", onclick: toggleContact },
                    [el("span", { html: iconSvg(inContacts ? "Trash" : "Plus", 22) }), inContacts ? " Удалить из контактов" : " Добавить в контакты"]
                  )
                : null,
              !user.isBot
                ? el(
                    "button",
                    { class: "profile-action-btn", onclick: () => openGiftShopDialog({ recipient: { id: user.id, name: user.name } }) },
                    [el("span", { html: iconSvg("Gift", 22) }), " Отправить подарок"]
                  )
                : null,
              !user.isBot && !isBlocked
                ? el("button", { class: "profile-action-btn secret-chat-btn", onclick: startSecretChat }, [el("span", { html: iconSvg("Lock", 22) }), " Начать секретный чат"])
                : null,
              el("button", { class: "profile-action-btn", onclick: shareContact }, [el("span", { html: iconSvg("Forward", 22) }), " Поделиться контактом"]),
              el(
                "button",
                { class: "profile-action-btn danger", onclick: toggleBlock },
                [el("span", { html: iconSvg("Lock", 22) }), isBlocked ? " Разблокировать" : " Заблокировать"]
              ),
              el(
                "button",
                { class: "profile-action-btn danger", onclick: () => openReportDialog("user", userId, user.name) },
                [el("span", { html: iconSvg("Info", 22) }), " Пожаловаться"]
              ),
            ].filter(Boolean)
          )
        : null,
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
                      el("p", { class: "profile-channel-sub" }, c.username ? `@${c.username}` : `${c.members} ${plural(c.members, "подписчик", "подписчика", "подписчиков")}`),
                    ]),
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

      me.isDeveloper && user.id !== me.id
        ? el("div", { class: "profile-admin-block" }, [
            el("p", { class: "profile-admin-title" }, [el("span", { html: iconSvg("Shield", 13) }), " Инструменты разработчика"]),
            el("button", { class: "profile-action-btn", onclick: () => openAdminUserPanel(user, onAdminChange) }, [
              el("span", { html: iconSvg("Shield", 14) }),
              " Выдать покупку, модерация, данные",
            ]),
          ])
        : null,
      tabs.length
        ? el(
        "div",
        { class: "profile-tabs" },
        tabs.map((t) =>
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
      )
        : null,
      tabs.length ? el("div", { class: "profile-tab-content" }, [renderTabContent()]) : null,
    ];
    body.append(...children.filter(Boolean));
    // Выбранная вкладка всегда видна в полоске, даже если она в конце (Голосовые, Группы).
    const strip = body.querySelector(".profile-tabs");
    const active = strip?.querySelector(".profile-tab.active");
    if (strip && active && strip.scrollWidth > strip.clientWidth) {
      const a = active.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      strip.scrollLeft += a.left - s.left - (s.width - a.width) / 2;
    }
  }
  render();
  loadStories();
  loadCampaignAd();
}
