// Правила приватности обязаны совпадать с server/lib/privacyRules.js: исключения пишет и
// читает каждый бэкенд. Старый модуль загружается в отдельном процессе (он открывает
// cwd/data при загрузке).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserSettings } from "../model/domain.js";
import { applyContactName, exceptionsFor, normalizePrivacy, PRIVACY_KEYS, privacyAllows, privacyAllowsLazy } from "./privacy-rules.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const many = Array.from({ length: 205 }, (_, i) => `u${i}`);
const PRIVACIES: UserSettings["privacy"][] = [
  undefined,
  {},
  { lastSeen: "nobody", phone: "everyone", photo: "contacts", bio: "bogus" },
  {
    lastSeen: "contacts",
    exceptions: {
      lastSeen: { allow: ["a", "a", "b", "", 5 as unknown as string], deny: ["b", "c"] },
      phone: { allow: ["x"], deny: [] },
      bogus: { allow: ["z"] },
      calls: { allow: [], deny: [] },
      photo: { allow: many },
    },
  },
  { exceptions: "битые" as unknown as Record<string, never> },
];
const VIEWERS = ["a", "b", "c", "x", "z", "u204", "u199", ""];
const CONTACTS = [
  null,
  { localName: "  Мама " },
  { localName: "Профиль" },
  { localName: "   " },
];

const SCRIPT = `
const p = require(${JSON.stringify(path.join(REPO_ROOT, "server", "lib", "privacyRules.js"))});
const privacies = ${JSON.stringify(PRIVACIES)}.map((x) => x ?? undefined);
const viewers = ${JSON.stringify(VIEWERS)};
const contacts = ${JSON.stringify(CONTACTS)};
const allows = [];
for (const pr of privacies) for (const key of [...p.PRIVACY_KEYS, "unknown"]) for (const v of viewers) for (const c of [false, true]) allows.push(p.privacyAllows(pr, key, v, c));
require("fs").writeFileSync(process.env.OUT, JSON.stringify({
  keys: p.PRIVACY_KEYS,
  normalized: privacies.map((x) => p.normalizePrivacy(x) ?? null),
  exceptions: privacies.map((x) => p.PRIVACY_KEYS.map((k) => p.exceptionsFor(x, k))),
  allows,
  names: contacts.flatMap((c) => [false, true].map((t) => p.applyContactName({ name: "Профиль" }, c, t))),
}));
`;

let dir: string;
let legacy: { keys: unknown; normalized: unknown; exceptions: unknown; allows: boolean[]; names: unknown };

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-privacy-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "out.json");
  execFileSync(process.execPath, ["-e", SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: "test", OUT: out }, stdio: "ignore" });
  legacy = JSON.parse(fs.readFileSync(out, "utf8"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("правила приватности совпадают с server/lib/privacyRules.js", () => {
  it("ключи, нормализация и исключения", () => {
    expect(PRIVACY_KEYS).toEqual(legacy.keys);
    expect(PRIVACIES.map((x) => JSON.parse(JSON.stringify(normalizePrivacy(x) ?? null)))).toEqual(legacy.normalized);
    expect(PRIVACIES.map((x) => PRIVACY_KEYS.map((k) => exceptionsFor(x, k)))).toEqual(legacy.exceptions);
  });

  it("privacyAllows и privacyAllowsLazy", () => {
    const allows: boolean[] = [];
    const lazy: boolean[] = [];
    for (const pr of PRIVACIES)
      for (const key of [...PRIVACY_KEYS, "unknown"])
        for (const v of VIEWERS)
          for (const c of [false, true]) {
            allows.push(privacyAllows(pr, key, v, c));
            // Пустой зритель — только в privacyAllows (allowsUser его не получает).
            if (v) lazy.push(privacyAllowsLazy(pr, key, v, () => c));
          }
    expect(allows).toEqual(legacy.allows);
    const expectedLazy = legacy.allows.filter((_, i) => VIEWERS[Math.floor(i / 2) % VIEWERS.length] !== "");
    expect(lazy).toEqual(expectedLazy);
  });

  it("applyContactName", () => {
    const names = CONTACTS.flatMap((c) =>
      [false, true].map((t) => JSON.parse(JSON.stringify(applyContactName({ name: "Профиль" }, c as never, t))))
    );
    expect(names).toEqual(legacy.names);
  });
});
