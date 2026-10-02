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

const MAX_FOLDERS = 10;
const MAX_FOLDER_NAME = 32;
const MAX_FOLDER_CHATS = 500;

function cleanFolderName(raw) {
  const name = typeof raw === "string" ? raw.trim().slice(0, MAX_FOLDER_NAME) : "";
  return name || null;
}

function cleanChatIds(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) return null;
  return [...new Set(raw)].slice(0, MAX_FOLDER_CHATS);
}

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name: rawName, chatIds: rawIds } = req.body ?? {};
    const name = cleanFolderName(rawName);
    if (!name) return res.status(400).json({ error: "Введите название папки" });
    const chatIds = cleanChatIds(rawIds);
    if (!chatIds) return res.status(400).json({ error: "Некорректный список чатов" });
    const folders = await listFoldersFor(req.uid);
    if (folders.length >= MAX_FOLDERS) {
      return res.status(400).json({ error: `Можно создать не больше ${MAX_FOLDERS} папок` });
    }
    const folder = await createFolder({
      id: genId("f"),
      ownerId: req.uid,
      name,
      chatIds,
      order: folders.reduce((max, f) => Math.max(max, (f.order ?? 0) + 1), 0),
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
    const body = req.body ?? {};
    const patch = {};
    if ("name" in body) {
      patch.name = cleanFolderName(body.name);
      if (!patch.name) return res.status(400).json({ error: "Введите название папки" });
    }
    if ("chatIds" in body) {
      patch.chatIds = cleanChatIds(body.chatIds);
      if (!patch.chatIds) return res.status(400).json({ error: "Некорректный список чатов" });
    }
    if ("order" in body) {
      if (!Number.isInteger(body.order)) return res.status(400).json({ error: "Некорректный порядок" });
      patch.order = body.order;
    }
    const folder = await updateFolder(req.params.id, patch);
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

router.post(
  "/invite/:code/import",
  asyncRoute(async (req, res) => {
    const folder = await findFolderByInviteCode(req.params.code);
    if (!folder) return res.status(404).json({ error: "Ссылка недействительна или отозвана" });
    if ((await listFoldersFor(req.uid)).length >= MAX_FOLDERS) {
      return res.status(400).json({ error: `Можно создать не больше ${MAX_FOLDERS} папок — удалите лишнюю в Настройки → Папки` });
    }

    const chatIds = [];
    for (const id of folder.chatIds) {
      const chat = await getChat(id);
      if (!chat?.isPublic) continue;
      chatIds.push(chat.id);
      if (chat.memberIds.includes(req.uid)) continue;
      if (chat.approveJoins) continue;
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
      order: existing.reduce((max, f) => Math.max(max, (f.order ?? 0) + 1), 0),
    });
    res.json({ folder: created });
  })
);

module.exports = router;
