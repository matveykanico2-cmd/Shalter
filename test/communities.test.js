const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// server/db.js открывает cwd/data/app.db — для теста берём пустую временную папку.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-communities-"));
fs.mkdirSync(path.join(dir, "data"));
process.chdir(dir);
const db = require("../server/db");
const c = require("../server/data/communities");

function chat(id, members) {
  db.prepare("INSERT INTO chats (id, type, title, ownerId, createdAt) VALUES (?, 'group', ?, ?, ?)").run(id, id, members[0], new Date().toISOString());
  for (const m of members) db.prepare("INSERT INTO chat_members (chatId, userId) VALUES (?, ?)").run(id, m);
}

chat("g1", ["owner", "alice"]);
chat("g2", ["bob"]);
chat("g3", ["carol", "bob"]);

test("владелец — участник с полными правами, чужой — не участник", () => {
  const cm = c.createCommunity({ id: "cm1", ownerId: "owner", title: "Test" });
  assert.equal(c.roleOf(cm, "owner"), "owner");
  assert.deepEqual(c.rightsOf(cm, "owner"), { editInfo: true, editChats: true, ban: true, addAdmins: true });
  assert.equal(c.roleOf(cm, "alice"), null);
});

test("участник чата сообщества становится участником сообщества", () => {
  assert.ok(c.addChatToCommunity("cm1", "g1", { addedBy: "owner" }));
  const cm = c.getCommunity("cm1");
  assert.equal(c.roleOf(cm, "alice"), "member");
  assert.equal(cm.addedBy.g1, "owner");
  assert.ok(c.listCommunitiesForUser("alice").some((x) => x.id === "cm1"));
});

test("чат нельзя добавить во второе сообщество", () => {
  c.createCommunity({ id: "cm2", ownerId: "bob", title: "Other" });
  assert.equal(c.addChatToCommunity("cm2", "g1"), false);
});

test("выход скрывает сообщество, но чаты остаются; вступление возвращает", () => {
  c.leaveCommunity("cm1", "alice");
  assert.equal(c.roleOf(c.getCommunity("cm1"), "alice"), null);
  assert.ok(!c.listCommunitiesForUser("alice").some((x) => x.id === "cm1"));
  assert.ok(db.prepare("SELECT 1 FROM chat_members WHERE chatId = 'g1' AND userId = 'alice'").get());
  c.joinCommunity("cm1", "alice");
  assert.equal(c.roleOf(c.getCommunity("cm1"), "alice"), "member");
});

test("админ получает только выданные права, снятие возвращает в участники", () => {
  c.setAdmin("cm1", "alice", { editChats: true, ban: 1, junk: true });
  const cm = c.getCommunity("cm1");
  assert.equal(c.roleOf(cm, "alice"), "admin");
  assert.deepEqual(c.rightsOf(cm, "alice"), { editInfo: false, editChats: true, ban: true, addAdmins: false });
  assert.deepEqual(c.listAdmins("cm1").map((a) => a.userId), ["alice"]);
  c.removeAdmin("cm1", "alice");
  assert.equal(c.roleOf(cm, "alice"), "member");
});

test("бан убирает из сообщества и его заявки; разбан снимает запрет", () => {
  assert.ok(c.addRequest({ id: "r1", communityId: "cm1", chatId: "g2", suggestedBy: "bob", visible: true }));
  assert.equal(c.addRequest({ id: "r2", communityId: "cm1", chatId: "g2", suggestedBy: "bob", visible: true }), false);
  c.joinCommunity("cm1", "bob");
  c.banUser("cm1", "bob", "owner");
  const cm = c.getCommunity("cm1");
  assert.equal(c.roleOf(cm, "bob"), null);
  assert.equal(c.countRequests("cm1"), 0);
  assert.ok(!c.listMemberIds("cm1").includes("bob"));
  c.joinCommunity("cm1", "bob");
  assert.equal(c.roleOf(cm, "bob"), null, "забаненный не вступает обратно");
  assert.ok(c.unbanUser("cm1", "bob"));
  assert.equal(c.roleOf(cm, "bob"), "member");
});

test("принятие чата в сообщество удаляет его заявки", () => {
  c.addRequest({ id: "r3", communityId: "cm1", chatId: "g3", suggestedBy: "carol", visible: false });
  assert.equal(c.countRequests("cm1"), 1);
  c.addChatToCommunity("cm1", "g3", { visible: false });
  assert.equal(c.countRequests("cm1"), 0);
  assert.deepEqual(c.getCommunity("cm1").hiddenChatIds, ["g3"]);
});

test("личные настройки: по умолчанию одной строкой и не закреплено", () => {
  assert.deepEqual(c.prefsOf("cm1", "carol"), { pinned: false, collapsed: true });
  c.setPrefs("cm1", "carol", { pinned: true, collapsed: false });
  assert.deepEqual(c.prefsOf("cm1", "carol"), { pinned: true, collapsed: false });
});

test("удаление чата из сообщества и самого сообщества", () => {
  assert.ok(c.removeChatFromCommunity("cm1", "g3"));
  assert.equal(c.removeChatFromCommunity("cm1", "g3"), false);
  c.deleteCommunity("cm1");
  assert.equal(c.getCommunity("cm1"), undefined);
  assert.equal(c.communityOfChat("g1"), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE communityId = 'cm1'").get().n, 0);
});
