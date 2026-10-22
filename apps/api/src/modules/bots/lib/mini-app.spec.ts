// Ссылка на мини-приложение обязана совпадать с server/lib/miniApp.js: initData, подписанные
// здесь, проверяет Bot API в server/ (checkWebAppData). Старый модуль — в отдельном процессе.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAppUrl, buildInitData, sameApp, validateAppUrl } from "./mini-app.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
const URLS = ["", "  ", "не адрес", "http://example.com", "http://localhost:3000/a", "https://u:p@example.com", "https://example.com/app?x=1#a=b", "ftp://x", null, 5];
const PAIRS = [
  ["https://a.com/x", "https://a.com/y?z=1"],
  ["https://a.com", "https://b.com"],
  ["https://a.com", "не адрес"],
  ["http://localhost:3000", "http://localhost:3001"],
];
const user = { id: "u_1", name: "Иван & Co", username: null, isPremium: true };
const initData = buildInitData({ token: TOKEN, user, chat: { id: "c_1" }, botUserId: "bot_1" });
const noChat = buildInitData({ token: TOKEN, user: { id: "u_2", name: "Б" }, chat: null, botUserId: "bot_1" });

const SCRIPT = `
const m = require(${JSON.stringify(path.join(REPO_ROOT, "server", "lib", "miniApp.js"))});
const pick = (r) => r.ok ? { ok: true, user: r.user, chatId: r.chatId, botId: r.botId } : r;
process.stdout.write(JSON.stringify({
  verified: [${JSON.stringify(initData)}, ${JSON.stringify(noChat)}].map((d) => pick(m.verifyInitData(${JSON.stringify(TOKEN)}, d))),
  wrongToken: m.verifyInitData("другой", ${JSON.stringify(initData)}).ok,
  urls: ${JSON.stringify(URLS)}.map(m.validateAppUrl),
  same: ${JSON.stringify(PAIRS)}.map(([a, b]) => m.sameApp(a, b)),
  built: [m.buildAppUrl("https://a.com/p?q=1#keep=1", "x=1&y=2", { theme: "dark" }), m.buildAppUrl("https://a.com", "d")],
}));
`;
const legacy = JSON.parse(execFileSync(process.execPath, ["-e", SCRIPT], { encoding: "utf8" }));

describe("мини-приложение бота — как server/lib/miniApp.js", () => {
  it("initData проходят проверку подписи в server/", () => {
    expect(legacy.verified).toEqual([
      { ok: true, user: { id: "u_1", name: "Иван & Co", username: null, isPremium: true }, chatId: "c_1", botId: "bot_1" },
      { ok: true, user: { id: "u_2", name: "Б", username: null, isPremium: false }, chatId: null, botId: "bot_1" },
    ]);
    expect(legacy.wrongToken).toBe(false);
  });

  it("проверка адреса, своё приложение и сборка ссылки", () => {
    expect(URLS.map(validateAppUrl)).toEqual(legacy.urls);
    expect(PAIRS.map(([a, b]) => sameApp(a, b))).toEqual(legacy.same);
    expect([buildAppUrl("https://a.com/p?q=1#keep=1", "x=1&y=2", { theme: "dark" }), buildAppUrl("https://a.com", "d")]).toEqual(legacy.built);
  });
});
