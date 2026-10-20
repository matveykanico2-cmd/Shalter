import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Модули сервера — CommonJS, грузим их обычным require.
const require = createRequire(import.meta.url);
const { levelForPoints, LEVEL_THRESHOLDS } = require("../../server/lib/groupLevels");

test("уровень растёт при переходе каждого порога", () => {
  assert.equal(levelForPoints(0), 0);
  assert.equal(levelForPoints(9), 0);
  assert.equal(levelForPoints(10), 1);
  assert.equal(levelForPoints(49), 1);
  assert.equal(levelForPoints(50), 2);
  assert.equal(levelForPoints(5000), LEVEL_THRESHOLDS.length);
  assert.equal(levelForPoints(999999), LEVEL_THRESHOLDS.length);
});

test("пороги строго возрастают", () => {
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    assert.ok(LEVEL_THRESHOLDS[i] > LEVEL_THRESHOLDS[i - 1]);
  }
});
