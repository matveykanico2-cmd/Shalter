const db = require("../db");

function rowToUser(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    phone: row.phone,
    email: row.email ?? undefined,
    passwordHash: row.passwordHash ?? undefined,
    passwordSalt: row.passwordSalt ?? undefined,
    avatarColor: row.avatarColor ?? undefined,
    avatarImage: row.avatarImage ?? undefined,
    bio: row.bio,
    online: !!row.online,
    lastSeen: row.lastSeen ?? undefined,
    isBot: !!row.isBot || undefined,
    blockedUserIds: JSON.parse(row.blockedUserIds),
  };
}

async function listUsers() {
  return db.prepare("SELECT * FROM users").all().map(rowToUser);
}

async function getUser(id) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return rowToUser(db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(normalized));
}

async function createUser(user) {
  db.prepare(
    `INSERT INTO users (id, name, username, phone, email, passwordHash, passwordSalt, avatarColor, avatarImage, bio, online, lastSeen, isBot, blockedUserIds)
     VALUES (@id, @name, @username, @phone, @email, @passwordHash, @passwordSalt, @avatarColor, @avatarImage, @bio, @online, @lastSeen, @isBot, @blockedUserIds)`
  ).run({
    id: user.id,
    name: user.name ?? "",
    username: user.username ?? "",
    phone: user.phone ?? "",
    email: user.email ?? null,
    passwordHash: user.passwordHash ?? null,
    passwordSalt: user.passwordSalt ?? null,
    avatarColor: user.avatarColor ?? null,
    avatarImage: user.avatarImage ?? null,
    bio: user.bio ?? "",
    online: user.online ? 1 : 0,
    lastSeen: user.lastSeen ?? null,
    isBot: user.isBot ? 1 : 0,
    blockedUserIds: JSON.stringify(user.blockedUserIds ?? []),
  });
  return getUser(user.id);
}

const PATCHABLE_FIELDS = ["name", "username", "phone", "email", "passwordHash", "passwordSalt", "avatarColor", "avatarImage", "bio", "online", "lastSeen", "isBot"];

async function updateUser(id, patch) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) return undefined;
  const fields = Object.keys(patch).filter((k) => PATCHABLE_FIELDS.includes(k));
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
    const values = {};
    for (const f of fields) {
      const v = patch[f];
      values[f] = typeof v === "boolean" ? (v ? 1 : 0) : v ?? null;
    }
    db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...values, id });
  }
  if ("blockedUserIds" in patch) {
    db.prepare("UPDATE users SET blockedUserIds = ? WHERE id = ?").run(JSON.stringify(patch.blockedUserIds ?? []), id);
  }
  return getUser(id);
}

async function setBlocked(userId, targetId, blocked) {
  const row = db.prepare("SELECT blockedUserIds FROM users WHERE id = ?").get(userId);
  if (!row) return undefined;
  const current = new Set(JSON.parse(row.blockedUserIds));
  if (blocked) current.add(targetId);
  else current.delete(targetId);
  db.prepare("UPDATE users SET blockedUserIds = ? WHERE id = ?").run(JSON.stringify([...current]), userId);
  return getUser(userId);
}

module.exports = {
  listUsers,
  getUser,
  findUserByEmail,
  createUser,
  updateUser,
  setBlocked,
};
