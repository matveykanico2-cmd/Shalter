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
    { kind: "image", url: "/uploads/sha_deadbeefdeadbeef.jpg", name: "фото.jpg", previewUrl: "javascript:1", posterUrl: "https://evil" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "/uploads/sha_deadbeefdeadbeef.jpg");
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

test("опрос: новый опрос создаётся без голосов — ни votes, ни voterIds с клиента не берутся", () => {
  const out = sanitizeAttachments([
    { kind: "poll", meta: { options: ["a", "b"], voterIds: [["u1", "u2"], ["u3"]], votes: [999, 999] } },
  ]);
  assert.deepEqual(out[0].meta.votes, [0, 0]);
  assert.deepEqual(out[0].meta.voterIds, [[], []]);
});

test("опрос: несколько ответов — только у обычного опроса, не у викторины", () => {
  const poll = sanitizeAttachments([{ kind: "poll", meta: { options: ["a", "b"], multiple: true } }]);
  assert.equal(poll[0].meta.multiple, true);
  const quiz = sanitizeAttachments([{ kind: "poll", meta: { options: ["a", "b"], multiple: true, correctIndex: 0 } }]);
  assert.equal(quiz[0].meta.multiple, false);
});

test("голосовое: осциллограмма и расшифровка сохраняются, мусор отбрасывается", () => {
  const [ok] = sanitizeAttachments([
    { kind: "voice", url: "/uploads/sha_deadbeefdeadbeef.webm", durationSec: 3, waveform: [0, 5, 31, 12], transcript: "  Привет  " },
  ]);
  assert.deepEqual(ok.waveform, [0, 5, 31, 12]);
  assert.equal(ok.transcript, "Привет");
  const [bad] = sanitizeAttachments([
    { kind: "voice", url: "/uploads/sha_deadbeefdeadbeef.webm", waveform: [1, 99, "x"], transcript: 42 },
  ]);
  assert.equal(bad.waveform, undefined);
  assert.equal(bad.transcript, undefined);
  const [img] = sanitizeAttachments([{ kind: "image", url: "/uploads/sha_deadbeefdeadbeef.jpg", waveform: [1], transcript: "x" }]);
  assert.equal(img.waveform, undefined);
  assert.equal(img.transcript, undefined);
});
