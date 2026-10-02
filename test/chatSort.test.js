const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "../public/js/lib/chatSort.js")).href);

const chat = (id, extra = {}) => ({ id, createdAt: "2026-01-01T00:00:00.000Z", ...extra });
const at = (iso) => ({ lastMessage: { createdAt: iso } });

test("закреплённые — сверху, в заданном порядке; без места — после упорядоченных", async () => {
  const { sortChats } = await load();
  const list = [
    chat("a", at("2026-05-05T00:00:00.000Z")),
    chat("p1", { pinned: true, pinOrder: 1, ...at("2026-01-02T00:00:00.000Z") }),
    chat("p0", { pinned: true, pinOrder: 0, ...at("2026-01-01T00:00:00.000Z") }),
    chat("pNull", { pinned: true, pinOrder: null, ...at("2026-09-09T00:00:00.000Z") }),
    chat("b", at("2026-06-06T00:00:00.000Z")),
  ];
  assert.deepEqual(sortChats(list).map((c) => c.id), ["p0", "p1", "pNull", "b", "a"]);
});

test("незакреплённые — по свежести последнего сообщения, без него — по дате создания", async () => {
  const { sortChats } = await load();
  const list = [chat("old", at("2026-01-01T00:00:00.000Z")), chat("empty", { createdAt: "2026-03-01T00:00:00.000Z" }), chat("new", at("2026-02-01T00:00:00.000Z"))];
  assert.deepEqual(sortChats(list).map((c) => c.id), ["empty", "new", "old"]);
});

test("sortChats не меняет исходный массив", async () => {
  const { sortChats } = await load();
  const list = [chat("x", at("2026-01-01T00:00:00.000Z")), chat("y", at("2026-02-01T00:00:00.000Z"))];
  sortChats(list);
  assert.deepEqual(list.map((c) => c.id), ["x", "y"]);
});

test("isChatMuted: навсегда, на срок (не истёк / истёк), не заглушён", async () => {
  const { isChatMuted } = await load();
  assert.equal(isChatMuted({ muted: true }), true);
  assert.equal(isChatMuted({ muted: false, mutedUntil: new Date(Date.now() + 3600e3).toISOString() }), true);
  assert.equal(isChatMuted({ muted: false, mutedUntil: new Date(Date.now() - 1000).toISOString() }), false);
  assert.equal(isChatMuted({ muted: false, mutedUntil: null }), false);
});
