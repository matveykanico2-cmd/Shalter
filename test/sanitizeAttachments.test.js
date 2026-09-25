const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeAttachments, isSafeUrl } = require("../server/lib/sanitizeAttachments");

test("isSafeUrl пропускает /uploads, data:, http(s), отвергает прочее", () => {
  assert.ok(isSafeUrl("/uploads/sha_deadbeefdeadbeef.jpg"));
  assert.ok(isSafeUrl("data:image/png;base64,AAAA"));
  assert.ok(isSafeUrl("https://example.com/a.jpg"));
  assert.ok(!isSafeUrl("javascript:alert(1)"));
  assert.ok(!isSafeUrl("file:///etc/passwd"));
  assert.ok(!isSafeUrl(123));
});

test("не-массив на входе → undefined", () => {
  assert.equal(sanitizeAttachments(null), undefined);
  assert.equal(sanitizeAttachments("nope"), undefined);
});

test("вложение с опасным url целиком отбрасывается", () => {
  const out = sanitizeAttachments([{ kind: "image", url: "javascript:alert(1)" }]);
  assert.equal(out, undefined);
});

test("неизвестный kind отбрасывается", () => {
  assert.equal(sanitizeAttachments([{ kind: "malware", url: "/uploads/x.bin" }]), undefined);
});

test("previewUrl/posterUrl с клиента вырезаются, url и name остаются", () => {
  const out = sanitizeAttachments([
    { kind: "image", url: "/uploads/a.jpg", name: "фото.jpg", previewUrl: "javascript:1", posterUrl: "https://evil" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "/uploads/a.jpg");
  assert.equal(out[0].name, "фото.jpg");
  assert.equal("previewUrl" in out[0], false);
  assert.equal("posterUrl" in out[0], false);
});

test("локация без координат отбрасывается; корректная — остаётся", () => {
  assert.equal(sanitizeAttachments([{ kind: "location", meta: {} }]), undefined);
  const out = sanitizeAttachments([{ kind: "location", meta: { lat: 55.75, lng: 37.61 } }]);
  assert.deepEqual(out[0].meta, { lat: 55.75, lng: 37.61 });
});

test("живое окно геолокации: сервер сам ставит expiresAt, чрезмерное окно игнорит", () => {
  const ok = sanitizeAttachments([{ kind: "location", meta: { lat: 1, lng: 2, liveMinutes: 60 } }]);
  assert.equal(ok[0].meta.live, true);
  assert.ok(typeof ok[0].meta.expiresAt === "string");
  const tooLong = sanitizeAttachments([{ kind: "location", meta: { lat: 1, lng: 2, liveMinutes: 100000 } }]);
  assert.equal(tooLong[0].meta.live, undefined);
});

test("опрос: меньше 2 вариантов отбрасывается", () => {
  assert.equal(sanitizeAttachments([{ kind: "poll", meta: { options: ["один"] } }]), undefined);
});

test("опрос: обычный (correctIndex null) не превращается в викторину", () => {
  const out = sanitizeAttachments([{ kind: "poll", meta: { options: ["да", "нет"], correctIndex: null } }]);
  assert.equal(out[0].meta.correctIndex, null);
});

test("викторина: валидный correctIndex сохраняется, вне диапазона — сбрасывается в null", () => {
  const q = sanitizeAttachments([{ kind: "poll", meta: { options: ["a", "b", "c"], correctIndex: 2 } }]);
  assert.equal(q[0].meta.correctIndex, 2);
  const bad = sanitizeAttachments([{ kind: "poll", meta: { options: ["a", "b"], correctIndex: 9 } }]);
  assert.equal(bad[0].meta.correctIndex, null);
});

test("опрос: votes считаются из voterIds, не берутся с клиента", () => {
  const out = sanitizeAttachments([
    { kind: "poll", meta: { options: ["a", "b"], voterIds: [["u1", "u2"], ["u3"]], votes: [999, 999] } },
  ]);
  assert.deepEqual(out[0].meta.votes, [2, 1]);
});
