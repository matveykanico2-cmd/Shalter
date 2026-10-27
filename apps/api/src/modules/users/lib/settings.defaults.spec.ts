// DEFAULT_SETTINGS и состояние «без звука» обязаны совпадать с server/data/settings.js: настройки
// одной строкой пишут оба бэкенда. Старый модуль загружается в отдельном процессе
// (server/db.js открывает cwd/data при загрузке).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserSettings } from "../model/domain.js";
import { DEFAULT_SETTINGS, isQuietNow, mutedStateFor } from "./settings.defaults.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";
const MUTED: UserSettings = { notifications: { mutedChats: { forever: true as const, until: FUTURE, over: PAST, broken: "не дата" } } };
const CHAT_IDS = ["forever", "until", "over", "broken", "none"];

const SCRIPT = `
const s = require(${JSON.stringify(path.join(REPO_ROOT, "server", "data", "settings.js"))});
const muted = ${JSON.stringify(MUTED)};
const ids = ${JSON.stringify(CHAT_IDS)};
require("fs").writeFileSync(process.env.OUT, JSON.stringify({
  defaults: s.DEFAULT_SETTINGS,
  muted: ids.map((id) => [s.mutedStateFor(muted, id), s.isQuietNow(muted, id)]),
}));
`;

let dir: string;
let legacy: { defaults: unknown; muted: unknown };

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-settings-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "out.json");
  execFileSync(process.execPath, ["-e", SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: "test", OUT: out }, stdio: "ignore" });
  legacy = JSON.parse(fs.readFileSync(out, "utf8"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("настройки совпадают с server/data/settings.js", () => {
  it("DEFAULT_SETTINGS", () => {
    expect(JSON.parse(JSON.stringify(DEFAULT_SETTINGS))).toEqual(legacy.defaults);
  });

  it("mutedStateFor и isQuietNow", () => {
    expect(CHAT_IDS.map((id) => [mutedStateFor(MUTED, id), isQuietNow(MUTED, id)])).toEqual(legacy.muted);
  });
});
