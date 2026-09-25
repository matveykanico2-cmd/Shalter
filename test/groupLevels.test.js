const { test } = require("node:test");
const assert = require("node:assert/strict");
const { levelForPoints, LEVEL_THRESHOLDS } = require("../server/lib/groupLevels");

test("уровень растёт при переходе каждого порога", () => {
  assert.equal(levelForPoints(0), 0);
  assert.equal(levelForPoints(9), 0);
  assert.equal(levelForPoints(10), 1);   // первый порог
  assert.equal(levelForPoints(49), 1);
  assert.equal(levelForPoints(50), 2);
  assert.equal(levelForPoints(5000), LEVEL_THRESHOLDS.length); // максимум
  assert.equal(levelForPoints(999999), LEVEL_THRESHOLDS.length);
});

test("пороги строго возрастают", () => {
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    assert.ok(LEVEL_THRESHOLDS[i] > LEVEL_THRESHOLDS[i - 1]);
  }
});
