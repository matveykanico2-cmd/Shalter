const { readCollection, updateCollection } = require("./store");

const FILE = "chats";

function listChats() {
  return readCollection(FILE);
}

async function listChatsForUser(userId) {
  const chats = await listChats();
  return chats.filter((c) => c.memberIds.includes(userId));
}

async function getChat(id) {
  const chats = await listChats();
  return chats.find((c) => c.id === id);
}

async function updateChat(id, patch) {
  let updated;
  await updateCollection(FILE, (chats) =>
    chats.map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch };
      return updated;
    })
  );
  return updated;
}

async function createChat(chat) {
  await updateCollection(FILE, (chats) => [...chats, chat]);
  return chat;
}

async function deleteChat(id) {
  await updateCollection(FILE, (chats) => chats.filter((c) => c.id !== id));
}

module.exports = { listChats, listChatsForUser, getChat, updateChat, createChat, deleteChat };
