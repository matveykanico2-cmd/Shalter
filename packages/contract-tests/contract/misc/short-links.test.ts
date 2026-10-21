// Короткие ссылки: создаёт их бот-помощник по команде «/short <url>» в любом чате
// (lib/helperBot/utility.js), открываются по GET /s/:code (внешний адрес — страница-
// предупреждение с кнопкой перехода, адрес этого же сервера — 302 на путь),
// счётчик для страницы /short — GET /api/short-links (без сессии).
import { describe, expect, test } from "vitest";
import { historyPage } from "../../schemas/messages";
import { shortLinksCount } from "../../schemas/misc";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { createDm, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { PUBLIC_HOST, useEgressProxy } from "../integrations/stubs";

// Сообщение «/short <url>» содержит ссылку, и сервер в фоне строит для неё превью.
// Чтобы прогон не ходил в интернет, исходящий fetch сервера идёт в локальный
// прокси, а адреса — IP из TEST-NET-3 (без DNS-запроса).
const egress = useEgressProxy();
const server = useServer({ env: egress.env });
const EVIL_HOST = "203.0.113.66";

const HELPER = "bot_helper";

async function count() {
  return expectOk(await new Api(server().baseUrl).get("/api/short-links"), shortLinksCount);
}

/** Ждёт n-й ответ помощника в чате (ответ шлётся асинхронно после отправки). */
async function helperReplies(user: TestUser, chatId: string, n: number): Promise<string[]> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const page = expectOk(await user.api.get(`/api/chats/${chatId}/messages`), historyPage);
    const replies = page.messages.filter((m) => m.senderId === HELPER).map((m) => m.text ?? "");
    if (replies.length >= n) return replies;
    if (Date.now() > deadline) throw new Error(`помощник не ответил ${n} раз(а); есть: ${JSON.stringify(replies)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function shorten(user: TestUser, chatId: string, url: string, n: number): Promise<string> {
  await sendText(user, chatId, `/short ${url}`);
  const reply = (await helperReplies(user, chatId, n))[n - 1];
  const m = /^🔗 Короткая ссылка: \/s\/([A-Za-z0-9]{6})\n\(откройте на этом же сервере Shalter\)$/.exec(reply);
  if (!m) throw new Error(`неожиданный ответ помощника: ${reply}`);
  return m[1];
}

describe("короткие ссылки", () => {
  test("/short в чате → /s/:code: внешний адрес — страница-предупреждение со ссылкой, счётчик растёт", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    expect(await count()).toEqual({ total: 0, thisMonth: 0 });

    const target = `http://${PUBLIC_HOST}/path?q=1&x=<b>#frag`;
    const code = await shorten(a, dm.id, target, 1);
    expect(await count()).toEqual({ total: 1, thisMonth: 1 });

    // Переход — без сессии, сколько угодно раз.
    for (let i = 0; i < 2; i++) {
      const res = await new Api(baseUrl).get(`/s/${code}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("content-type")).toMatch(/^text\/html/);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.text).toContain("Переход на внешний сайт");
      expect(res.text).toContain(`<strong>${PUBLIC_HOST}</strong>`);
      // Адрес экранирован, ссылка «Перейти» ведёт на него.
      const escaped = new URL(target).href.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      expect(res.text).toContain(`<a class="btn go" href="${escaped}" rel="noopener noreferrer nofollow">Перейти</a>`);
      expect(res.text).not.toContain("<b>");
    }
    // Ответ помощника видят оба участника.
    expect((await helperReplies(b, dm.id, 1))[0]).toContain(`/s/${code}`);
  });

  test("ссылка на этот же сервер — 302 на путь, без предупреждения", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const code = await shorten(a, dm.id, `${baseUrl}/games?x=1`, 1);
    const res = await new Api(baseUrl).get(`/s/${code}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/games?x=1");
  });

  test("неверный адрес — подсказка, ссылка не создаётся", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const before = await count();
    await sendText(a, dm.id, "/short ftp://example.com/file");
    await sendText(a, dm.id, "/short");
    const replies = await helperReplies(a, dm.id, 2);
    expect(replies).toEqual(["Использование: /short https://example.com", "Использование: /short https://example.com"]);
    expect(await count()).toEqual(before);
  });

  test("внешний адрес не открывается редиректом (нет открытого редиректа с домена Shalter)", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    const dm = await createDm(a, b);
    const code = await shorten(a, dm.id, `http://${EVIL_HOST}/login`, 1);
    const res = await new Api(baseUrl).get(`/s/${code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.text).toContain(`Ссылка ведёт на <strong>${EVIL_HOST}</strong> — это не Shalter.`);
  });

  test("неизвестный код — 404 текстом (не JSON)", async () => {
    const res = await new Api(server().baseUrl).get("/s/zzzzzz");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(res.text).toBe("Ссылка не найдена");
    // Код чувствителен к регистру.
    expect((await new Api(server().baseUrl).get("/s/ZZZZZZ")).status).toBe(404);
  });
});
