const crypto = require("crypto");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { TTL_MS, listStoriesForUsers, listArchivedStoriesFor, addStory, getStoryById, markViewed, deleteStory } = require("../data/stories");
const { getSettings } = require("../data/settings");
const { privacyAllows } = require("../lib/privacyRules");
const { listContactsFor, listOwnersOf } = require("../data/contacts");
const { getUser } = require("../data/users");
const { getChat, listChatsForUser } = require("../data/chats");
const { publicUser } = require("../data/sanitize");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { broadcastToUsers } = require("../ws");

const MAX_ITEMS = 10;

// Истории каналов лежат в той же таблице, тем же userId-столбцом — только в
// нём id канала (c_…), а не человека (u_…/bot_…): префиксы никогда не
// пересекаются, так что коллизий не бывает и отдельная колонка не нужна.
function isChannelId(id) {
  return typeof id === "string" && id.startsWith("c_");
}

function isChannelStaff(chat, uid) {
  return chat?.ownerId === uid || (chat?.adminIds ?? []).includes(uid);
}

// Автор истории для отдачи клиенту — человек или канал, в форме, которую уже
// умеет рисовать storiesBar.js (он смотрит только на .id/.name/.avatarColor/
// .avatarImage, так что канал подставляется без правок на клиенте).
// canManage — «может ли смотрящий удалить эту историю»: тем же полем
// storyViewer.js отличает свою историю от чужой, и для канала это не автор
// строки, а его владелец/админ.
async function authorInfo(id, viewerId) {
  if (isChannelId(id)) {
    const chat = await getChat(id);
    if (!chat || chat.type !== "channel") return null;
    return {
      id: chat.id,
      name: chat.title,
      username: chat.username ?? null,
      avatarColor: chat.avatarColor,
      avatarImage: chat.avatarImage ?? null,
      isChannel: true,
      canManage: isChannelStaff(chat, viewerId),
    };
  }
  const user = await getUser(id);
  return user ? publicUser(user) : null;
}

// Одна история — сколько угодно кадров (до MAX_ITEMS). Общая проверка для
// личных историй и историй канала, чтобы правило кадров не разъезжалось.
function sanitizeStoryItems(body) {
  const { kind, url } = body ?? {};
  const rawItems = Array.isArray(body?.items) && body.items.length ? body.items : [{ kind, url }];
  return rawItems
    .slice(0, MAX_ITEMS)
    .filter((it) => it && ["image", "video"].includes(it.kind) && it.url && isSafeUrl(it.url))
    .map((it) => ({ kind: it.kind, url: it.url }));
}

// Кому рассказывать про эту историю: автору (он смотрит с нескольких устройств)
// и всем, у кого автор в контактах, — ровно та же граница видимости, что и у
// ленты выше. Без этого удалённая история оставалась висеть на чужих экранах до
// перезагрузки, и автор не мог её убрать по-настоящему.
function audienceOf(authorId) {
  return [...new Set([authorId, ...listOwnersOf(authorId)])];
}

const router = express.Router();
router.use(requireUserId);

// Stories from your contacts + your own, plus every channel you're a member
// of — same "who can see this" boundary Telegram/Instagram use (people you
// follow), and this app already has contacts + channel membership to reuse
// for it rather than "everyone" or "nobody".
async function visibleAuthorIds(uid) {
  const contacts = await listContactsFor(uid);
  const chats = await listChatsForUser(uid);
  const channelIds = chats.filter((c) => c.type === "channel").map((c) => c.id);
  return [uid, ...contacts.map((c) => c.userId), ...channelIds];
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const authorIds = await visibleAuthorIds(req.uid);
    const stories = await listStoriesForUsers(authorIds);

    const byAuthor = new Map();
    for (const s of stories) {
      if (!byAuthor.has(s.userId)) byAuthor.set(s.userId, []);
      byAuthor.get(s.userId).push(s);
    }

    const groups = await Promise.all(
      [...byAuthor.entries()].map(async ([authorId, items]) => {
        const user = await authorInfo(authorId, req.uid);
        const sorted = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          user,
          stories: sorted.map((s) => ({ ...s, viewed: s.viewedByIds.includes(req.uid) })),
        };
      })
    );

    res.json({ groups: groups.filter((g) => g.user) });
  })
);

// Истории одного человека — для кнопки в его профиле. Границу видимости
// повторяем ту же, что и в ленте выше: свои истории видно всегда, чужие —
// если человек у вас в контактах. Иначе профиль стал бы обходным путём
// смотреть истории тех, кто вам их не показывает.
router.get(
  "/user/:userId",
  asyncRoute(async (req, res) => {
    const targetId = req.params.userId;
    const allowed = await visibleAuthorIds(req.uid);
    if (!allowed.includes(targetId)) return res.json({ group: null });

    const stories = await listStoriesForUsers([targetId]);
    if (!stories.length) return res.json({ group: null });

    const user = await authorInfo(targetId, req.uid);
    if (!user) return res.json({ group: null });
    res.json({
      group: {
        user,
        stories: stories
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((st) => ({ ...st, viewed: st.viewedByIds.includes(req.uid) })),
      },
    });
  })
);

// Архив историй в профиле: всё, что человек когда-либо выкладывал, включая
// истёкшее. Лента на «Чатах» и кружки по-прежнему показывают только живые
// истории — здесь ровно то место, где срок не действует.
//
// Кто это видит: сам человек — всегда, остальные — по настройке
// «Архив историй» (по умолчанию «никто»). Прошедшие сутки истории задумывались
// временными, и раздавать их посторонним без разрешения нельзя.
router.get(
  "/user/:userId/archive",
  asyncRoute(async (req, res) => {
    const targetId = req.params.userId;
    const isSelf = targetId === req.uid;

    if (isChannelId(targetId)) {
      // Канал — не личный дневник: архив открыт любому подписчику, без
      // настройки видимости. Срок жизни у карусели наверху тот же, здесь
      // просто нет «до завтра» — только членство в канале.
      const chat = await getChat(targetId);
      if (!chat || chat.type !== "channel" || !chat.memberIds.includes(req.uid)) {
        return res.json({ stories: [], allowed: false });
      }
    } else if (!isSelf) {
      // Та же граница, что и у живых историй: сначала «показывают ли вам этого
      // человека вообще», и только потом — «открыт ли архив».
      const allowed = await visibleAuthorIds(req.uid);
      if (!allowed.includes(targetId)) return res.json({ stories: [], allowed: false });
      const { privacy } = await getSettings(targetId);
      const contacts = await listContactsFor(targetId);
      const isContact = contacts.some((c) => c.userId === req.uid);
      if (!privacyAllows(privacy, "storiesArchive", req.uid, isContact)) {
        return res.json({ stories: [], allowed: false });
      }
    }

    const all = await listArchivedStoriesFor(targetId);
    const now = Date.now();
    res.json({
      allowed: true,
      stories: all.map((st) => ({
        ...st,
        viewed: st.viewedByIds.includes(req.uid),
        // Клиенту нужно отличать живую историю от архивной: первую можно
        // открыть в просмотрщике как обычно, вторая — уже история из прошлого.
        expired: new Date(st.expiresAt).getTime() <= now,
      })),
    });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    // Одна история — сколько угодно кадров. Раньше на каждый выбранный файл
    // заводилась своя история, и десять снимков превращались в десять историй,
    // которые автор потом удалял по одной. Старая форма запроса (kind + url)
    // продолжает работать: это та же история из одного кадра.
    const items = sanitizeStoryItems(req.body);
    if (!items.length) return res.status(400).json({ error: "invalid story" });

    const now = Date.now();
    const story = await addStory({
      // Со случайным хвостом, а не голая миллисекунда: id — это PRIMARY KEY, а
      // истории выкладывают пачкой (в ленте выбирают сразу несколько файлов, см.
      // components/storiesBar.js). Две маленькие картинки успевают уехать внутри
      // одной миллисекунды — вторая вставка падала на нарушении ключа, запрос
      // отвечал 500, и цикл отправки обрывался: из пяти выбранных снимков
      // выкладывался один, молча.
      id: `st_${now}_${crypto.randomBytes(4).toString("hex")}`,
      userId: req.uid,
      items,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      viewedByIds: [],
    });
    // Лента у остальных обновляется сама — тем же путём, что и удаление ниже.
    broadcastToUsers(audienceOf(req.uid), { type: "story:new", storyId: story.id, userId: req.uid });
    res.json({ story });
  })
);

// История от имени канала — публикует владелец/админ, видят все подписчики
// (участники канала), а не только его контакты. Та же таблица, тот же формат
// кадров — только userId хранит id канала (authorInfo выше это понимает).
router.post(
  "/channel/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || chat.type !== "channel") return res.status(400).json({ error: "Истории есть только у каналов" });
    if (!isChannelStaff(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    const items = sanitizeStoryItems(req.body);
    if (!items.length) return res.status(400).json({ error: "invalid story" });

    const now = Date.now();
    const story = await addStory({
      id: `st_${now}_${crypto.randomBytes(4).toString("hex")}`,
      userId: chat.id,
      items,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      viewedByIds: [],
    });
    broadcastToUsers(chat.memberIds, { type: "story:new", storyId: story.id, userId: chat.id });
    res.json({ story });
  })
);

router.post(
  "/:id/view",
  asyncRoute(async (req, res) => {
    // Та же граница видимости, что и у ленты: отметить просмотр можно только у
    // той истории, которую вам вообще показывают. Раньше здесь не было ни одной
    // проверки, а в ответ уезжала вся история целиком — со ссылками на кадры.
    // То есть достаточно было знать id, чтобы вытащить историю человека, у
    // которого ты не в контактах, в обход ленты и профиля.
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });

    const story = await markViewed(req.params.id, req.uid);
    res.json({ story });
  })
);

// Кто смотрел историю. Автору — своей; истории канала — его владельцу/админам.
// Список зрителей — это про того, кто выложил, посторонним знать, кто что
// смотрел, незачем.
router.get(
  "/:id/viewers",
  asyncRoute(async (req, res) => {
    const story = await getStoryById(req.params.id);
    if (!story) return res.status(404).json({ error: "not found" });
    if (isChannelId(story.userId)) {
      const chat = await getChat(story.userId);
      if (!chat || !isChannelStaff(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    } else if (story.userId !== req.uid) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const users = await Promise.all(story.viewedByIds.filter((id) => id !== req.uid).map((id) => getUser(id)));
    res.json({ viewers: users.filter(Boolean).map(publicUser) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const story = await getStoryById(req.params.id);
    if (!story) return res.status(404).json({ error: "not found" });

    // Личная история удаляется своим автором; история канала — владельцем/
    // админом канала. deleteStory сверяет userId в базе, поэтому «ключ
    // владения» здесь — id канала, а не того, кто нажал «Удалить».
    let audience;
    if (isChannelId(story.userId)) {
      const chat = await getChat(story.userId);
      if (!chat || !isChannelStaff(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
      audience = chat.memberIds;
    } else if (story.userId !== req.uid) {
      return res.status(403).json({ error: "Недостаточно прав" });
    } else {
      audience = audienceOf(req.uid);
    }

    const ok = await deleteStory(req.params.id, story.userId);
    if (!ok) return res.status(404).json({ error: "not found" });
    // Удалили — значит у всех: у того, кто её сейчас смотрит, история
    // закрывается, из ленты пропадает кружок. Иначе «удалено» означало лишь
    // «удалено у меня», а чужие экраны продолжали её показывать.
    broadcastToUsers(audience, { type: "story:deleted", storyId: req.params.id, userId: story.userId });
    res.json({ ok: true });
  })
);

module.exports = router;
