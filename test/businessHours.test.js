const { test } = require("node:test");
const assert = require("node:assert/strict");
const { businessStatus, isWithinBusinessHours, isValidTimeZone, localNow } = require("../server/lib/businessHours");

// Полная неделя для тестов: будни 09–18, пятница через полночь 20:00–02:00,
// суббота круглосуточно, воскресенье выходной.
const D = (open, close, closed = false) => ({ open, close, closed });
const WEEK = {
  mon: D("09:00", "18:00"),
  tue: D("09:00", "18:00"),
  wed: D("09:00", "18:00"),
  thu: D("09:00", "18:00"),
  fri: D("20:00", "02:00"),
  sat: D("00:00", "24:00"),
  sun: D("09:00", "18:00", true),
};
// 2026-09-21 — понедельник.
const at = (iso) => new Date(iso);

test("обычный день: закрыто до открытия, открыто внутри, закрыто после", () => {
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-21T08:00:00Z")).open, false);
  assert.deepEqual(businessStatus(WEEK, "UTC", at("2026-09-21T12:00:00Z")), { open: true, until: "18:00" });
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-21T18:00:00Z")).open, false);
});

test("до открытия сегодня — opensAt указывает на сегодня", () => {
  const s = businessStatus(WEEK, "UTC", at("2026-09-21T08:00:00Z"));
  assert.deepEqual(s.opensAt, { day: "mon", time: "09:00", today: true });
});

test("после закрытия — opensAt указывает на следующий рабочий день", () => {
  const s = businessStatus(WEEK, "UTC", at("2026-09-21T18:00:00Z"));
  assert.deepEqual(s.opensAt, { day: "tue", time: "09:00", today: false });
});

test("работа через полночь: пятница 23:00 открыто, суббота 01:00 ещё пятничная смена", () => {
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-25T23:00:00Z")).open, true); // пт 23:00
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-26T01:00:00Z")).open, true); // сб 01:00 — хвост пятницы
});

test("круглосуточная суббота открыта в любой час", () => {
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-26T03:00:00Z")).open, true);
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-26T23:59:00Z")).open, true);
});

test("выходное воскресенье закрыто, следующее открытие — понедельник", () => {
  const s = businessStatus(WEEK, "UTC", at("2026-09-27T12:00:00Z"));
  assert.equal(s.open, false);
  assert.equal(s.opensAt.day, "mon");
});

test("часовой пояс бизнеса решает открытость, а не пояс сервера", () => {
  // 06:30 UTC = 09:30 в Москве → рабочее время; в UTC ещё закрыто (до 09:00).
  assert.equal(businessStatus(WEEK, "Europe/Moscow", at("2026-09-21T06:30:00Z")).open, true);
  assert.equal(businessStatus(WEEK, "UTC", at("2026-09-21T06:30:00Z")).open, false);
});

test("isWithinBusinessHours согласован с businessStatus", () => {
  assert.equal(isWithinBusinessHours(WEEK, "UTC"), businessStatus(WEEK, "UTC").open);
});

test("isValidTimeZone принимает реальные пояса и отвергает мусор", () => {
  assert.equal(isValidTimeZone("Europe/Moscow"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Nowhere/Nope"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
});

test("localNow даёт день, время и дату в нужном поясе", () => {
  // 20:00 UTC 21 сентября = 03:00 22 сентября в Новосибирске (UTC+7).
  const n = localNow("Asia/Novosibirsk", at("2026-09-21T20:00:00Z"));
  assert.equal(n.date, "2026-09-22");
  assert.equal(n.hm, "03:00");
});

test("нет рабочих дней вовсе — opensAt null, не падает", () => {
  const closed = Object.fromEntries(Object.keys(WEEK).map((k) => [k, D("09:00", "18:00", true)]));
  const s = businessStatus(closed, "UTC", at("2026-09-21T12:00:00Z"));
  assert.equal(s.open, false);
  assert.equal(s.opensAt, null);
});
