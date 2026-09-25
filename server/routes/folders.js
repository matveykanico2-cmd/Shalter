const crypto = require("crypto");
const { genId } = require("../lib/genId");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const {
  listFoldersFor,
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
  findFolderByInviteCode,
  setFolderInviteCode,
} = require("../data/folders");
const { getChat, updateChat } = require("../data/chats");
const { broadcastToUsers } = require("../ws");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const folders = await listFoldersFor(req.uid);
    res.json({ folders });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name, chatIds } = req.body ?? {};
    const folders = await listFoldersFor(req.uid);
    const folder = await createFolder({
      id: genId("f"),
      ownerId: req.uid,
      name,
      chatIds: chatIds ?? [],
      order: folders.length,
    });
    res.json({ folder });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getFolder(req.params.id);
    if (!existing || existing.ownerId !== req.uid) {
      return res.status(404).json({ error: "not found" });
    }
    const folder = await updateFolder(req.params.id, req.body ?? {});
    res.json({ folder });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await getFolder(req.params.id);
    if (!existing || existing.ownerId !== req.uid) {
      return res.status(404).json({ error: "not found" });
    }
    await deleteFolder(req.params.id);
    res.json({ ok: true });
  })
);

// Ссылка-приглашение на папку — как у чата, но отдаёт список чатов, а не сам
// чат. Отдаём только публичные (isPublic) чаты и каналы: у личного чата или
// закрытой группы нет открытого способа в неё войти, а показывать их
// название/аватар постороннему по одной лишь ссылке на папку — рассказывать
// про переписку тому, кто в неё даже не входит.
router.post(
  "/:id/invite-link",
  asyncRoute(async (req, res) => {
    const folder = await getFolder(req.params.id);
    if (!folder || folder.ownerId !== req.uid) return res.status(404).json({ error: "not found" });
    const code = crypto.randomBytes(8).toString("hex");
    const updated = await setFolderInviteCode(folder.id, code);
    res.json({ folder: updated });
  })
);

router.delete(
  "/:id/invite-link",
  asyncRoute(async (req, res) => {
    const folder = await getFolder(req.params.id);
    if (!folder || folder.ownerId !== req.uid) return res.status(404).json({ error: "not found" });
    const updated = await setFolderInviteCode(folder.id, null);
    res.json({ folder: updated });
  })
);

router.get(
  "/invite/:code",
  asyncRoute(async (req, res) => {
    const folder = await findFolderByInviteCode(req.params.code);
    if (!folder) return res.status(404).json({ error: "Ссылка недействительна или отозвана" });
    const chats = (await Promise.all(folder.chatIds.map((id) => getChat(id))))
      .filter((c) => c?.isPublic)
      .map((c) => ({ id: c.id, type: c.type, title: c.title, username: c.username, avatarColor: c.avatarColor, avatarImage: c.avatarImage }));
    res.json({ name: folder.name, chats });
  })
);

// Копирует папку себе: новая личная папка с тем же именем, автоматически
// вступая в те публичные чаты из неё, где ещё не состоишь. Закрытые чаты
// (не попавшие в превью выше по той же причине) сюда и не попадают —
// импортировать можно только то, что было показано.
router.post(
  "/invite/:code/import",
  asyncRoute(async (req, res) => {
    const folder = await findFolderByInviteCode(req.params.code);
    if (!folder) return res.status(404).json({ error: "Ссылка недействительна или отозвана" });

    const chatIds = [];
    for (const id of folder.chatIds) {
      const chat = await getChat(id);
      if (!chat?.isPublic) continue;
      chatIds.push(chat.id);
      if (chat.memberIds.includes(req.uid)) continue;
      if (chat.approveJoins) continue; // закрытое на вступление — папка не обходит эту защиту
      const updated = await updateChat(chat.id, { memberIds: [...chat.memberIds, req.uid] });
      broadcastToUsers([req.uid], { type: "chat:added", chat: updated });
      broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    }

    const existing = await listFoldersFor(req.uid);
    const created = await createFolder({
      id: genId("f"),
      ownerId: req.uid,
      name: folder.name,
      chatIds,
      order: existing.length,
    });
    res.json({ folder: created });
  })
);

module.exports = router;
