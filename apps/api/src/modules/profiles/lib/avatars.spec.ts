// Проверки аватарки обязаны совпадать с server/lib/avatars.js: одни и те же списки пишут оба
// бэкенда (старый модуль — в отдельном процессе). Ожидания для статуса сняты со старого
// server/lib/profileStatus.js перед его удалением.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_AVATARS, validateEntry } from "./avatars.js";
import { slotsFor, validateImage } from "./profile-status.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const ENTRIES = [
  { url: "/uploads/abc_0123456789abcdef.webm", kind: "video", poster: PNG, extra: 1 },
  { url: "/uploads/abc_0123456789abcdef", kind: "gif", poster: PNG },
  { url: "/uploads/../x", poster: PNG },
  { url: "/uploads/abc_0123456789abcdef.jpg" },
  { url: "/uploads/abc_0123456789abcdef.jpg", poster: "data:image/gif;base64,AAAA" },
  { url: "/uploads/abc_0123456789abcdef.jpg", poster: `data:image/png;base64,${"A".repeat(400 * 1024)}` },
  null,
];
const IMAGES = [PNG, "data:image/gif;base64,R0lG", "data:image/svg+xml;base64,AAAA", `data:image/png;base64,${"A".repeat(80 * 1024)}`, undefined, 5];
const USERS = [undefined, { isPremium: false }, { isPremium: true }];

const SCRIPT = `
const a = require(${JSON.stringify(path.join(REPO_ROOT, "server", "lib", "avatars.js"))});
process.stdout.write(JSON.stringify({
  max: a.MAX_AVATARS,
  entries: ${JSON.stringify(ENTRIES)}.map(a.validateEntry),
}));
`;

describe("аватарки и статусы совпадают с server/lib", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-avatars-"));
  const scriptPath = path.join(tmp, "legacy.cjs");
  fs.writeFileSync(scriptPath, SCRIPT, "utf8");
  const legacy = JSON.parse(execFileSync(process.execPath, [scriptPath], { encoding: "utf8" }));

  it("validateEntry и MAX_AVATARS", () => {
    expect(MAX_AVATARS).toBe(legacy.max);
    expect(JSON.parse(JSON.stringify(ENTRIES.map((e) => validateEntry(e as never))))).toEqual(legacy.entries);
  });

  it("validateImage и slotsFor", () => {
    expect(JSON.parse(JSON.stringify(IMAGES.map(validateImage)))).toEqual([
      { image: PNG },
      { image: "data:image/gif;base64,R0lG" },
      { error: "Некорректное изображение" },
      { error: "Картинка слишком большая" },
      { error: "Некорректное изображение" },
      { error: "Некорректное изображение" },
    ]);
    expect(USERS.map(slotsFor)).toEqual([1, 1, 5]);
  });
});
