const { test } = require("node:test");
const assert = require("node:assert/strict");
const { can, isStaff, sanitizePermissions, permissionsOf, DEFAULTS } = require("../server/lib/chatPermissions");

test("isStaff распознаёт владельца, совладельца, админа и модератора", () => {
  assert.ok(isStaff({ ownerId: "a" }, "a"));
  assert.ok(isStaff({ ownerIds: ["b"] }, "b"));
  assert.ok(isStaff({ adminIds: ["c"] }, "c"));
  assert.ok(isStaff({ moderatorIds: ["d"] }, "d"));
  assert.ok(!isStaff({ ownerId: "a" }, "x"));
  assert.ok(!isStaff(null, "a"));
});

test("can: не-группы (dm/канал/отсутствие) не ограничиваются", () => {
  assert.ok(can({ type: "dm" }, "u", "sendMessages"));
  assert.ok(can({ type: "channel" }, "u", "sendMessages"));
  assert.ok(can(null, "u", "sendMessages"));
});

test("can: в группе персонал обходит любые запреты", () => {
  const chat = { type: "group", ownerId: "boss", permissions: { sendMessages: false } };
  assert.ok(can(chat, "boss", "sendMessages"));
  assert.ok(!can(chat, "member", "sendMessages"));
});

test("can: по умолчанию всё разрешено обычному участнику", () => {
  const chat = { type: "group", ownerId: "boss" };
  assert.ok(can(chat, "member", "sendMedia"));
  assert.ok(can(chat, "member", "pinMessages"));
});

test("sanitizePermissions оставляет только известные ключи как булевы", () => {
  const out = sanitizePermissions({ sendMessages: false, addMembers: true, evil: "yes", __proto__: { hacked: true } });
  assert.equal(out.sendMessages, false);
  assert.equal(out.addMembers, true);
  assert.equal("evil" in out, false);
  assert.equal(out.hacked, undefined);
  // Все ключи булевы, отсутствующий в запросе = true (не false).
  for (const v of Object.values(out)) assert.equal(typeof v, "boolean");
  assert.equal(out.sendPolls, true);
});

test("sanitizePermissions на мусоре возвращает null", () => {
  assert.equal(sanitizePermissions(null), null);
  assert.equal(sanitizePermissions("nope"), null);
});

test("permissionsOf накладывает настройки чата поверх дефолтов", () => {
  assert.deepEqual(permissionsOf(null), DEFAULTS);
  assert.equal(permissionsOf({ permissions: { pinMessages: false } }).pinMessages, false);
  assert.equal(permissionsOf({ permissions: { pinMessages: false } }).sendMessages, true);
});
