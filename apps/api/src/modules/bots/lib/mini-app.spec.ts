// Ссылка на мини-приложение и проверка initData. Ожидания сняты со старого server/lib/miniApp.js
// перед его удалением: подписи, сделанные раньше, обязаны и дальше проходить проверку.
import { describe, expect, it } from "vitest";
import { buildAppUrl, buildInitData, sameApp, validateAppUrl, verifyInitData } from "./mini-app.js";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
const URLS = ["", "  ", "не адрес", "http://example.com", "http://localhost:3000/a", "https://u:p@example.com", "https://example.com/app?x=1#a=b", "ftp://x", null, 5];
const PAIRS = [
  ["https://a.com/x", "https://a.com/y?z=1"],
  ["https://a.com", "https://b.com"],
  ["https://a.com", "не адрес"],
  ["http://localhost:3000", "http://localhost:3001"],
];
const NOT_HTTPS = "Адрес приложения должен начинаться с https:// (http — только для localhost)";
const BAD_URL = "Некорректный адрес приложения";

describe("мини-приложение бота", () => {
  it("initData проходят проверку подписи; чужой токен — нет", () => {
    const user = { id: "u_1", name: "Иван & Co", username: null, isPremium: true };
    const withChat = buildInitData({ token: TOKEN, user, chat: { id: "c_1" }, botUserId: "bot_1" });
    const noChat = buildInitData({ token: TOKEN, user: { id: "u_2", name: "Б" }, chat: null, botUserId: "bot_1" });
    expect(verifyInitData(TOKEN, withChat)).toMatchObject({ ok: true, user, chatId: "c_1", botId: "bot_1" });
    expect(verifyInitData(TOKEN, noChat)).toMatchObject({ ok: true, user: { id: "u_2", name: "Б", username: null, isPremium: false }, chatId: null, botId: "bot_1" });
    expect(verifyInitData("другой", withChat).ok).toBe(false);
    expect(verifyInitData(TOKEN, withChat.replace(/auth_date=\d+/, "auth_date=1")).ok).toBe(false);
  });

  it("плохие initData — с прежним текстом ошибки", () => {
    expect(["", "a=1", "a=1&hash=00"].map((d) => verifyInitData(TOKEN, d))).toEqual([
      { ok: false, error: "initData is empty" },
      { ok: false, error: "no hash in initData" },
      { ok: false, error: "bad hash" },
    ]);
  });

  it("проверка адреса, своё приложение и сборка ссылки", () => {
    expect(URLS.map(validateAppUrl)).toEqual([
      { url: null },
      { url: null },
      { error: BAD_URL },
      { error: NOT_HTTPS },
      { url: "http://localhost:3000/a" },
      { error: "В адресе приложения не должно быть логина и пароля" },
      { url: "https://example.com/app?x=1#a=b" },
      { error: NOT_HTTPS },
      { url: null },
      { error: BAD_URL },
    ]);
    expect(PAIRS.map(([a, b]) => sameApp(a, b))).toEqual([true, false, false, false]);
    expect([buildAppUrl("https://a.com/p?q=1#keep=1", "x=1&y=2", { theme: "dark" }), buildAppUrl("https://a.com", "d")]).toEqual([
      "https://a.com/p?q=1#keep=1&shalterWebApp=x%3D1%26y%3D2&shalterTheme=dark",
      "https://a.com/#shalterWebApp=d",
    ]);
  });
});
