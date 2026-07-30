const { readCollection, updateCollection } = require("./store");

const FILE = "users";

function listUsers() {
  return readCollection(FILE);
}

async function getUser(id) {
  const users = await listUsers();
  return users.find((u) => u.id === id);
}

async function findUserByEmail(email) {
  const users = await listUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email?.toLowerCase() === normalized);
}

async function createUser(user) {
  await updateCollection(FILE, (users) => [...users, user]);
  return user;
}

async function updateUser(id, patch) {
  let updated;
  await updateCollection(FILE, (users) =>
    users.map((u) => {
      if (u.id !== id) return u;
      updated = { ...u, ...patch };
      return updated;
    })
  );
  return updated;
}

async function setBlocked(userId, targetId, blocked) {
  let updated;
  await updateCollection(FILE, (users) =>
    users.map((u) => {
      if (u.id !== userId) return u;
      const current = new Set(u.blockedUserIds ?? []);
      if (blocked) current.add(targetId);
      else current.delete(targetId);
      updated = { ...u, blockedUserIds: [...current] };
      return updated;
    })
  );
  return updated;
}

module.exports = {
  listUsers,
  getUser,
  findUserByEmail,
  createUser,
  updateUser,
  setBlocked,
};
