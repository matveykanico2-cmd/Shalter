// Повторы отложенных обязаны совпадать с server/data/scheduledMessages.js: срок следующей
// отправки пишет каждый бэкенд. Старый модуль загружается в отдельном процессе (server/db.js
// открывает cwd/data при загрузке).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextOccurrence, REPEATS, WHEN_ONLINE } from "./scheduled-repeat.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const NOW = "2026-03-15T12:00:00.000Z";
const BASES = ["2026-01-31T09:30:00.000Z", "2025-02-28T23:59:59.000Z", "2024-02-29T00:00:00.000Z", "2026-03-15T12:00:00.000Z", "не дата"];
const KINDS = [...REPEATS, "bogus"];

const SCRIPT = `
const s = require(${JSON.stringify(path.join(REPO_ROOT, "server", "data", "scheduledMessages.js"))});
const bases = ${JSON.stringify(BASES)};
const kinds = ${JSON.stringify(KINDS)};
require("fs").writeFileSync(process.env.OUT, JSON.stringify({
  repeats: s.REPEATS,
  whenOnline: s.WHEN_ONLINE,
  next: bases.flatMap((b) => kinds.map((k) => s.nextOccurrence(b, k, ${JSON.stringify(NOW)}))),
}));
`;

let dir: string;
let legacy: { repeats: unknown; whenOnline: unknown; next: unknown };

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-scheduled-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "out.json");
  execFileSync(process.execPath, ["-e", SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: "test", OUT: out }, stdio: "ignore" });
  legacy = JSON.parse(fs.readFileSync(out, "utf8"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("повторы отложенных совпадают с server/data/scheduledMessages.js", () => {
  it("REPEATS, WHEN_ONLINE и nextOccurrence", () => {
    expect(REPEATS).toEqual(legacy.repeats);
    expect(WHEN_ONLINE).toBe(legacy.whenOnline);
    expect(BASES.flatMap((b) => KINDS.map((k) => nextOccurrence(b, k, NOW)))).toEqual(legacy.next);
  });
});
