const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listUsers, updateUser, getUser, setBlocked, findUserByUsername, findUserByPhone } = require("../data/users");
const { publicUser, selfUser, publicUsers } = require("../data/sanitize");
const { getSettings } = require("../data/settings");
const { privacyAllows } = require("../lib/privacyRules");
const { listContactsFor } = require("../data/contacts");
const { listChats, listChatsForUser, getChat, findDmBetween } = require("../data/chats");
const { isStaff } = require("../lib/chatPermissions");
const { updateSettings } = require("../data/settings");
const { listMediaMessages, listMessages } = require("../data/messages");
const { PHONE_RE, normalizePhone, isValidBirthday } = require("../lib/validators");
const { checkUsername, normalizeUsername, isUsernameConflict } = require("../lib/username");

const LINK_RE = /https?:\/\/\S+/;

// Закреплённые каналы в профиле — «вот что я веду».
//
// Условие ровно одно и оно важное: канал должен быть публичным. Профиль видят
// посторонние, и закреплённый в нём закрытый канал означал бы, что название
// частного канала (а с ним и сам факт его существования) читает кто угодно,
// кто открыл профиль, — при том что зайти туда всё равно нельзя. Публичный
// канал и так находится поиском, поэтому показывать его не риск, а ссылка.
const MAX_PINNED_CHANNELS = 6;

// Каналы, которые этот человек вправе закрепить: его собственные — те, где он
// владелец или администратор, — и публичные.
async function pinnableChannelsFor(userId) {
  const chats = await listChatsForUser(userId);
  return chats.filter((c) => c.type === "channel" && c.isPublic && isStaff(c, userId));
}

// Карточка канала для профиля: ничего лишнего, только то, чем он подписан на
// экране, и username — по нему делается переход.
function channelCard(chat, viewerId) {
  return {
    id: chat.id,
    title: chat.title,
    username: chat.username ?? null,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    isVerified: !!chat.isVerified,
    members: (chat.memberIds ?? []).length,
    // Открыть канал может только тот, кто на него подписан: /api/chats/:id
    // требует участия. Поэтому профиль должен знать заранее, что предложить —
    // «Открыть» или «Подписаться», — а не выяснять это отказом сервера уже
    // после нажатия.
    isMember: (chat.memberIds ?? []).includes(viewerId),
  };
}

// Что показать в профиле. Список хранится в настройках владельца профиля, но
// проверяется на каждом чтении, а не только при сохранении: канал мог с тех пор
// стать закрытым, его могли удалить, а самого человека — разжаловать из
// администраторов. Закреплённая карточка пережила бы всё это и продолжала
// висеть в профиле, ведя в никуда.
//
// Проверка здесь — не перестраховка, а единственная настоящая: pinnedChannelIds
// лежит в общих настройках, а PATCH /api/settings принимает любые ключи как
// есть. То есть записать в этот список чужой закрытый канал может кто угодно —
// и не покажет его именно эта функция. Убрать её, положившись на проверку при
// сохранении, значит открыть названия закрытых каналов всему свету.
async function pinnedChannelsOf(userId, viewerId) {
  const { pinnedChannelIds } = await getSettings(userId);
  const ids = Array.isArray(pinnedChannelIds) ? pinnedChannelIds.slice(0, MAX_PINNED_CHANNELS) : [];
  if (!ids.length) return [];
  const chats = await Promise.all(ids.map((id) => getChat(id).catch(() => null)));
  return chats
    .filter((chat) => chat && chat.type === "channel" && chat.isPublic && isStaff(chat, userId))
    .map((chat) => channelCard(chat, viewerId));
}

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const users = await listUsers();
    res.json({ users: publicUsers(users.filter((u) => u.id !== req.uid)) });
  })
);

// Exact-match-only lookup — the one legitimate way to find someone to add as
// a contact (see public/js/views/contacts.js): unlike GET / above (which
// dumps every user on the server and used to power a browse-and-click "add
// contact" list), this can't be used to enumerate/browse anyone, only to
// resolve a specific @username you already know, same as Telegram's own
// "add by username" flow.
router.get(
  "/by-username/:username",
  asyncRoute(async (req, res) => {
    const user = await findUserByUsername(req.params.username);
    if (!user || user.id === req.uid) return res.status(404).json({ error: "not found" });
    res.json({ user: publicUser(user) });
  })
);

// Only profile fields may be edited this way — never credentials
// (passwordHash/passwordSalt/email/id), even for your own account. username
// and phone get their own uniqueness/format checks below (same rules as
// registration — see server/lib/validators.js) since, unlike name/bio, other
// people rely on these being unique to find/message the right account.
const EDITABLE_FIELDS = ["name", "username", "phone", "bio", "avatarColor", "avatarImage", "birthday"];

// Powers the profile view (public/js/components/profileDialog.js). Unlike
// every other place a user object gets sent to a client (chat lists,
// message senders, contacts...), this is the one spot that actually
// enforces the target's Settings → Privacy choices for phone/last-seen —
// those settings exist but nothing reads them anywhere else yet; scoping
// the fix to this new profile endpoint rather than auditing every publicUser
// call site is a deliberate, contained improvement, not a claim that
// privacy is now enforced everywhere.
router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "not found" });

    const isSelf = req.params.id === req.uid;
    // Your own profile keeps the e-mail; everyone else's never carries it.
    const visible = isSelf ? selfUser(user) : publicUser(user);
    // "contacts"-level privacy means "people *the target* has added" (same
    // sense as Telegram's "My Contacts") — so this checks the target's own
    // contact list for the viewer, not the other way around.
    const targetsContacts = isSelf ? [] : await listContactsFor(req.params.id);
    const isContact = !isSelf && targetsContacts.some((c) => c.userId === req.uid);

    if (!isSelf) {
      const { privacy } = await getSettings(req.params.id);
      // Уровень («Все / Мои контакты / Никто») плюс поимённые исключения —
      // см. server/lib/privacyRules.js.
      const canSee = (key) => privacyAllows(privacy, key, req.uid, isContact);
      if (!canSee("phone")) delete visible.phone;
      if (!canSee("lastSeen")) delete visible.lastSeen;
      if (!canSee("bio")) delete visible.bio;
      if (!canSee("birthday")) delete visible.birthday;
      // «Фото профиля» до сих пор было единственной настройкой из этого
      // списка, которую нигде не читали: выставить «Никто» было можно, а
      // аватар всё равно отдавался. Проверяется здесь же, вместе с остальными.
      // Убирать надо оба поля: avatarImage — текущий снимок, avatarImages —
      // вся галерея профиля (см. server/db.js), и второе без первого просто
      // отдало бы то же самое фото другой дорогой.
      if (!canSee("photo")) {
        delete visible.avatarImage;
        delete visible.avatarImages;
      }
    }

    res.json({ user: visible, isContact, pinnedChannels: await pinnedChannelsOf(req.params.id, req.uid) });
  })
);

// Свои каналы, которые можно закрепить, — для окна выбора в собственном
// профиле. Отдельным запросом, а не вместе с профилем: посторонним этот список
// не нужен, а владельцу он нужен только когда он открыл выбор.
router.get(
  "/me/pinnable-channels",
  asyncRoute(async (req, res) => {
    const channels = await pinnableChannelsFor(req.uid);
    res.json({ channels: channels.map((c) => channelCard(c, req.uid)), max: MAX_PINNED_CHANNELS });
  })
);

// Сохранение выбора. Через отдельный маршрут, а не общим PATCH /api/settings:
// тот принимает что прислали, и закрепить можно было бы любой чужой канал —
// достаточно знать его идентификатор. Здесь список сверяется с тем, что человек
// действительно вправе закрепить.
router.put(
  "/me/pinned-channels",
  asyncRoute(async (req, res) => {
    const requested = Array.isArray(req.body?.chatIds) ? req.body.chatIds.filter((id) => typeof id === "string") : [];
    const allowed = new Set((await pinnableChannelsFor(req.uid)).map((c) => c.id));
    // Порядок сохраняем тот, в котором прислали: в профиле карточки идут
    // сверху вниз, и это единственный способ решить, какая из них первая.
    const chatIds = [...new Set(requested)].filter((id) => allowed.has(id)).slice(0, MAX_PINNED_CHANNELS);
    await updateSettings(req.uid, { pinnedChannelIds: chatIds });
    res.json({ pinnedChannels: await pinnedChannelsOf(req.uid, req.uid) });
  })
);

// Media/Files/Links tabs on the profile view (profileDialog.js) — scoped to
// whatever DM already exists between the viewer and this user. Deliberately
// looks up (never creates) that DM: opening someone's profile shouldn't have
// the side effect of starting a chat with them, the same way it doesn't in
// Telegram. No DM yet (or no matching attachments) just means empty tabs.
router.get(
  "/:id/shared-media",
  asyncRoute(async (req, res) => {
    const empty = { media: [], files: [], links: [] };
    if (req.params.id === req.uid) return res.json(empty);

    // Запросом по join-таблице, а не перебором всех чатов сервера: вкладки
    // «медиа/файлы/ссылки» открываются на каждый просмотр профиля.
    const chat = await findDmBetween(req.uid, req.params.id);
    if (!chat) return res.json(empty);

    // Только то, что может попасть в эти вкладки: вложения и ссылки.
    const messages = listMediaMessages(chat.id, req.uid);
    const media = [];
    const files = [];
    const links = [];
    for (const m of messages) {
      for (const a of m.attachments ?? []) {
        if (a.kind === "image" || a.kind === "video") media.push({ messageId: m.id, createdAt: m.createdAt, attachment: a });
        else if (a.kind === "file") files.push({ messageId: m.id, createdAt: m.createdAt, attachment: a });
      }
      if (m.linkPreview || LINK_RE.test(m.text ?? "")) {
        links.push({ messageId: m.id, createdAt: m.createdAt, text: m.text, linkPreview: m.linkPreview });
      }
    }
    res.json({ media: media.reverse(), files: files.reverse(), links: links.reverse() });
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

    if ("username" in patch) {
      // Shared with registration and with a channel claiming a public handle
      // (lib/username.js). This branch used to check only the users table,
      // while routes/chats.js's /:id/public checked both — so a person could
      // take a handle a public channel already had, and /u/:username then
      // resolved to whichever of the two the lookup happened to hit first.
      patch.username = normalizeUsername(patch.username);
      const problem = await checkUsername(patch.username, { forUserId: req.uid });
      if (problem) return res.status(problem.status).json({ error: problem.error });
    }
    if ("birthday" in patch) {
      // Пустое значение — «не указана»: так дату можно стереть, а не только
      // заменить другой.
      const value = String(patch.birthday ?? "").trim();
      if (!value) patch.birthday = null;
      else if (!isValidBirthday(value)) return res.status(400).json({ error: "Дата рождения указана неверно" });
      else patch.birthday = value;
    }
    if ("phone" in patch) {
      const normalized = normalizePhone(patch.phone);
      if (!PHONE_RE.test(normalized)) {
        return res.status(400).json({ error: "Введите номер телефона в формате +79991234567" });
      }
      const existing = await findUserByPhone(normalized);
      if (existing && existing.id !== req.uid) return res.status(409).json({ error: "Этот номер уже используется другим аккаунтом" });
      patch.phone = normalized;
    }

    let user;
    try {
      user = await updateUser(req.params.id, patch);
    } catch (err) {
      if (isUsernameConflict(err)) return res.status(409).json({ error: "Этот юзернейм уже занят" });
      throw err;
    }
    res.json({ user: user ? publicUser(user) : null });
  })
);

router.post(
  "/:id/block",
  asyncRoute(async (req, res) => {
    const { blocked } = req.body ?? {};
    const user = await setBlocked(req.uid, req.params.id, blocked);
    res.json({ user: user ? publicUser(user) : null });
  })
);

module.exports = router;
