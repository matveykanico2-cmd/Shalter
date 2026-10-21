const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listUsersByIds, updateUser, getUser, setBlocked, findUserByUsername, findUserByPhone, setAvatars } = require("../data/users");
const { publicUser, selfUser, publicUsers } = require("../data/sanitize");
const { getSettings } = require("../data/settings");
const { privacyAllows, publicUserFor, publicUsersFor, applyContactName } = require("../lib/privacyRules");
const { listContactsFor, contactNote } = require("../data/contacts");
const { countBotAudience } = require("../data/bots");
const { listChats, listChatsForUser, getChat, findDmBetween } = require("../data/chats");
const { isStaff } = require("../lib/chatPermissions");
const { updateSettings } = require("../data/settings");
const { listMediaMessages, listMessages } = require("../data/messages");
const { PHONE_RE, normalizePhone, normalizeBirthday } = require("../lib/validators");
const { checkUsername, normalizeUsername, isUsernameConflict } = require("../lib/username");
const { notifyProfileChanged } = require("../lib/notifyProfileChanged");
const { isOwnUploadUrl, usesForeignUpload } = require("../lib/uploadAccess");
const { businessStatus } = require("../lib/businessHours");
const { isAdminPhone } = require("../config");
const { verifyPassword } = require("../security");
const { withGiftSenders } = require("../lib/giftSenders");

const LINK_RE = /https?:\/\/\S+/;

const MAX_PINNED_CHANNELS = 6;

async function pinnableChannelsFor(userId) {
  const chats = await listChatsForUser(userId);
  return chats.filter((c) => c.type === "channel" && c.isPublic && isStaff(c, userId));
}

function channelCard(chat, viewerId) {
  return {
    id: chat.id,
    title: chat.title,
    username: chat.username ?? null,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    isVerified: !!chat.isVerified,
    members: (chat.memberIds ?? []).length,
    isMember: (chat.memberIds ?? []).includes(viewerId),
  };
}

async function pinnedChannelsOf(userId, viewerId) {
  const { pinnedChannelIds } = await getSettings(userId);
  const ids = Array.isArray(pinnedChannelIds) ? pinnedChannelIds.slice(0, MAX_PINNED_CHANNELS) : [];
  if (!ids.length) return [];
  const chats = await Promise.all(ids.map((id) => getChat(id).catch(() => null)));
  return chats
    .filter((chat) => chat && chat.type === "channel" && chat.isPublic && isStaff(chat, userId))
    .map((chat) => channelCard(chat, viewerId));
}

async function commonGroupsOf(viewerId, otherId) {
  if (viewerId === otherId) return [];
  const chats = await listChatsForUser(viewerId);
  return chats.filter((c) => c.type === "group" && (c.memberIds ?? []).includes(otherId));
}

const MAX_NAME = 64;
const MAX_LAST_NAME = 60;
const MAX_BIO = 300;
const MAX_ADDRESS = 200;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_POSTER_BYTES = 400 * 1024;

const router = express.Router();
router.use(requireUserId);

router.get(
  "/blocked",
  asyncRoute(async (req, res) => {
    const me = await getUser(req.uid);
    const ids = me?.blockedUserIds ?? [];
    if (!ids.length) return res.json({ users: [] });
    res.json({ users: await publicUsersFor(await listUsersByIds(ids), req.uid) });
  })
);

router.get(
  "/by-username/:username",
  asyncRoute(async (req, res) => {
    const user = await findUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: "not found" });
    // Свой ник тоже находим: раньше на него приходило «не найден», и своя ссылка
    // /u/<ник> показывала «такого аккаунта нет», если клиент не узнал её сам.
    if (user.id === req.uid) return res.json({ user: { ...(await publicUserFor(user, req.uid)), isSelf: true } });
    res.json({ user: await publicUserFor(user, req.uid) });
  })
);

const EDITABLE_FIELDS = ["name", "lastName", "username", "phone", "bio", "avatarColor", "avatarImage", "birthday", "businessAddress", "businessLat", "businessLng", "nameColor", "profileBanner"];
// Встроенные баннеры профиля (public/js/lib/profileBanners.js) и своё фото из загрузок.
const BANNER_ID_RE = /^[a-z0-9-]{1,32}$/;
const BANNER_UPLOAD_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}\.(jpe?g|png|webp|gif)$/;
// Цвета имени — палитра peer colors из Telegram.
const NAME_COLORS = ["red", "orange", "violet", "green", "cyan", "blue", "pink"];

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "not found" });

    const isSelf = req.params.id === req.uid;
    const visible = isSelf ? selfUser(user) : publicUser(user);
    const targetsContacts = isSelf ? [] : await listContactsFor(req.params.id);
    const isContact = !isSelf && targetsContacts.some((c) => c.userId === req.uid);
    const myContact = isSelf ? null : (await listContactsFor(req.uid)).find((c) => c.userId === req.params.id);

    if (!isSelf) {
      const { privacy } = await getSettings(req.params.id);
      const canSee = (key) => privacyAllows(privacy, key, req.uid, isContact);
      if (canSee("phone")) visible.phone = user.phone;
      if (!canSee("lastSeen")) {
        delete visible.lastSeen;
        visible.online = false;
      }
      if (!canSee("bio")) delete visible.bio;
      if (!canSee("birthday")) delete visible.birthday;
      if (!canSee("photo")) {
        delete visible.avatarImage;
        delete visible.avatarImages;
      }
      // Заблокированному — как будто всё скрыто настройками: ни фото и статуса,
      // ни телефона, «о себе» и дня рождения.
      if ((user.blockedUserIds ?? []).includes(req.uid)) {
        delete visible.avatarImage;
        delete visible.avatarImages;
        delete visible.lastSeen;
        delete visible.phone;
        delete visible.bio;
        delete visible.birthday;
        visible.online = false;
      }
    }

    if (!isSelf) applyContactName(visible, myContact, isContact);

    if (user.isBusiness) {
      const { business } = await getSettings(req.params.id);
      if (business?.enabled && business.showHours !== false && business.hours) {
        visible.businessHours = {
          hours: business.hours,
          timeZone: business.timeZone ?? null,
          status: businessStatus(business.hours, business.timeZone),
        };
      }
    }

    if (user.isBot) {
      visible.botUserCount = countBotAudience(req.params.id);
    }

    const commonGroupsCount = isSelf ? 0 : (await commonGroupsOf(req.uid, req.params.id)).length;

    if (Array.isArray(visible.giftsReceived)) visible.giftsReceived = await withGiftSenders(visible.giftsReceived, req.uid);

    res.json({
      user: visible,
      isContact,
      inContacts: !!myContact,
      contactName: myContact?.localName ?? null,
      contactNote: contactNote(myContact),
      commonGroupsCount,
      pinnedChannels: await pinnedChannelsOf(req.params.id, req.uid),
    });
  })
);

router.get(
  "/me/pinnable-channels",
  asyncRoute(async (req, res) => {
    const channels = await pinnableChannelsFor(req.uid);
    res.json({ channels: channels.map((c) => channelCard(c, req.uid)), max: MAX_PINNED_CHANNELS });
  })
);

router.put(
  "/me/pinned-channels",
  asyncRoute(async (req, res) => {
    const requested = Array.isArray(req.body?.chatIds) ? req.body.chatIds.filter((id) => typeof id === "string") : [];
    const allowed = new Set((await pinnableChannelsFor(req.uid)).map((c) => c.id));
    const chatIds = [...new Set(requested)].filter((id) => allowed.has(id)).slice(0, MAX_PINNED_CHANNELS);
    await updateSettings(req.uid, { pinnedChannelIds: chatIds });
    res.json({ pinnedChannels: await pinnedChannelsOf(req.uid, req.uid) });
  })
);

router.get(
  "/:id/shared-media",
  asyncRoute(async (req, res) => {
    const empty = { chatId: null, media: [], files: [], links: [], voice: [] };
    if (req.params.id === req.uid) return res.json(empty);

    const chat = await findDmBetween(req.uid, req.params.id);
    if (!chat) return res.json(empty);

    const clearedBefore = (await getSettings(req.uid)).chatClears?.[chat.id] ?? null;

    const messages = listMediaMessages(chat.id, req.uid).filter((m) => !clearedBefore || m.createdAt > clearedBefore);
    const media = [];
    const files = [];
    const links = [];
    const voice = [];
    for (const m of messages) {
      for (const a of m.attachments ?? []) {
        const item = { messageId: m.id, createdAt: m.createdAt, senderId: m.senderId, attachment: a };
        if (a.kind === "image" || a.kind === "video") media.push(item);
        else if (a.kind === "file") files.push(item);
        else if (a.kind === "voice" || a.kind === "video-note") voice.push(item);
      }
      if (m.linkPreview || LINK_RE.test(m.text ?? "")) {
        links.push({ messageId: m.id, createdAt: m.createdAt, text: m.text, linkPreview: m.linkPreview });
      }
    }
    res.json({ chatId: chat.id, media: media.reverse(), files: files.reverse(), links: links.reverse(), voice: voice.reverse() });
  })
);

router.get(
  "/:id/common-chats",
  asyncRoute(async (req, res) => {
    const groups = await commonGroupsOf(req.uid, req.params.id);
    res.json({
      chats: groups.map((c) => ({
        id: c.id,
        title: c.title,
        avatarColor: c.avatarColor ?? null,
        avatarImage: c.avatarImage ?? null,
        members: (c.memberIds ?? []).length,
      })),
    });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    if (req.params.id !== req.uid) return res.status(403).json({ error: "forbidden" });
    const body = req.body ?? {};
    const patch = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) patch[key] = body[key];
    }

    for (const key of ["name", "lastName", "username", "phone", "bio", "avatarColor", "birthday", "businessAddress"]) {
      if (key in patch && patch[key] != null && typeof patch[key] !== "string") {
        return res.status(400).json({ error: "Некорректное значение поля" });
      }
    }
    if ("name" in patch) {
      patch.name = String(patch.name ?? "").trim();
      if (!patch.name) return res.status(400).json({ error: "Введите имя" });
      if (patch.name.length > MAX_NAME) return res.status(400).json({ error: `Имя — не длиннее ${MAX_NAME} символов` });
    }
    if ("lastName" in patch) {
      patch.lastName = String(patch.lastName ?? "").trim() || null;
      if (patch.lastName && patch.lastName.length > MAX_LAST_NAME) {
        return res.status(400).json({ error: `Фамилия — не длиннее ${MAX_LAST_NAME} символов` });
      }
    }
    if ("bio" in patch) {
      patch.bio = String(patch.bio ?? "").trim();
      if (patch.bio.length > MAX_BIO) return res.status(400).json({ error: `«О себе» — не длиннее ${MAX_BIO} символов` });
    }
    if ("avatarColor" in patch && !COLOR_RE.test(patch.avatarColor ?? "")) {
      return res.status(400).json({ error: "Некорректный цвет" });
    }
    if ("businessAddress" in patch) {
      patch.businessAddress = String(patch.businessAddress ?? "").trim() || null;
      if (patch.businessAddress && patch.businessAddress.length > MAX_ADDRESS) {
        return res.status(400).json({ error: `Адрес — не длиннее ${MAX_ADDRESS} символов` });
      }
    }
    if ("nameColor" in patch) {
      if (patch.nameColor != null && !NAME_COLORS.includes(patch.nameColor)) return res.status(400).json({ error: "Некорректный цвет имени" });
      if (patch.nameColor != null && !(await getUser(req.uid))?.isPremium) {
        return res.status(403).json({ error: "Цвет имени доступен с Shalter Premium" });
      }
    }
    if ("profileBanner" in patch) {
      const b = patch.profileBanner;
      if (b == null) patch.profileBanner = null;
      else if (typeof b !== "object" || typeof b.id !== "string" || !BANNER_ID_RE.test(b.id)) {
        return res.status(400).json({ error: "Некорректный баннер" });
      } else if (b.id === "custom") {
        if (typeof b.url !== "string" || !BANNER_UPLOAD_RE.test(b.url)) return res.status(400).json({ error: "Некорректное изображение баннера" });
        // Только свой загруженный файл (текущий баннер можно сохранить повторно).
        const currentUrl = (await getUser(req.uid))?.profileBanner?.url;
        if (b.url !== currentUrl && !(await isOwnUploadUrl(req.uid, b.url))) {
          return res.status(400).json({ error: "Некорректное изображение баннера" });
        }
        patch.profileBanner = { id: "custom", url: b.url };
      } else {
        patch.profileBanner = { id: b.id };
      }
    }
    for (const key of ["businessLat", "businessLng"]) {
      if (key in patch && patch[key] != null && !Number.isFinite(Number(patch[key]))) {
        return res.status(400).json({ error: "Некорректные координаты" });
      }
    }
    let avatarPoster;
    if ("avatarImage" in patch) {
      avatarPoster = patch.avatarImage;
      delete patch.avatarImage;
      if (avatarPoster != null && (typeof avatarPoster !== "string" || !POSTER_RE.test(avatarPoster) || avatarPoster.length > MAX_POSTER_BYTES)) {
        return res.status(400).json({ error: "Некорректное изображение" });
      }
    }

    if ("username" in patch) {
      patch.username = normalizeUsername(patch.username);
      const problem = await checkUsername(patch.username, { forUserId: req.uid });
      if (problem) return res.status(problem.status).json({ error: problem.error });
    }
    if ("birthday" in patch) {
      const value = String(patch.birthday ?? "").trim();
      if (!value) patch.birthday = null;
      else if (!(patch.birthday = normalizeBirthday(value))) return res.status(400).json({ error: "Дата рождения указана неверно" });
    }
    if ("phone" in patch) {
      const normalized = normalizePhone(patch.phone);
      if (!PHONE_RE.test(normalized)) {
        return res.status(400).json({ error: "Введите номер телефона в формате +79991234567" });
      }
      const existing = await findUserByPhone(normalized);
      if (existing && existing.id !== req.uid) return res.status(409).json({ error: "Этот номер уже используется другим аккаунтом" });
      // Права админа привязаны к номеру, а номер не подтверждается — поэтому
      // ни занять админский номер, ни освободить его сменой номера нельзя.
      const me = await getUser(req.uid);
      if (normalized !== me?.phone && (isAdminPhone(normalized) || isAdminPhone(me?.phone))) {
        return res.status(403).json({ error: "Этот номер нельзя установить" });
      }
      // К номеру привязаны вход по коду, восстановление доступа и поиск —
      // сменить его можно только с паролем от аккаунта (как и почту).
      if (normalized !== me?.phone) {
        const password = body.currentPassword;
        if (typeof password !== "string" || !password) {
          return res.status(400).json({ error: "Чтобы сменить номер, введите пароль от аккаунта" });
        }
        if (!me?.passwordHash || !me?.passwordSalt || !verifyPassword(password, me.passwordHash, me.passwordSalt)) {
          return res.status(401).json({ error: "Неверный пароль" });
        }
      }
      patch.phone = normalized;
    }

    // Адрес, фамилия и т. п. тоже видны всем — чужой файл через них не открыть.
    if (usesForeignUpload(req.uid, patch, await getUser(req.uid))) return res.status(400).json({ error: "Некорректная ссылка на файл" });

    let user;
    try {
      user = await updateUser(req.params.id, patch);
    } catch (err) {
      if (isUsernameConflict(err)) return res.status(409).json({ error: "Этот юзернейм уже занят" });
      throw err;
    }
    if (user && avatarPoster !== undefined) {
      const rest = (user.avatarImages ?? []).filter((a) => a.url !== user.avatarImage);
      user = await setAvatars(req.uid, avatarPoster ? [{ url: avatarPoster, kind: "image", poster: avatarPoster }, ...rest] : rest);
    }

    if (user) notifyProfileChanged(req.uid, user);
    res.json({ user: user ? selfUser(user) : null });
  })
);

router.post(
  "/:id/block",
  asyncRoute(async (req, res) => {
    const { blocked } = req.body ?? {};
    if (req.params.id === req.uid) return res.status(400).json({ error: "Нельзя заблокировать самого себя" });
    // Разблокировать можно и удалённого — чтобы его id не застрял в списке.
    if (blocked && !(await getUser(req.params.id))) return res.status(404).json({ error: "Пользователь не найден" });
    await setBlocked(req.uid, req.params.id, blocked);
    // В ответе — тот, кого (раз)блокировали, глазами блокирующего; удалённый — null.
    const target = await getUser(req.params.id);
    res.json({ user: target ? await publicUserFor(target, req.uid) : null });
  })
);

module.exports = router;
