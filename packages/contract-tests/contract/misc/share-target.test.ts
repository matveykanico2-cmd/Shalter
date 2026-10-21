// Системное «Поделиться» (Web Share Target): браузер шлёт POST /share-target
// (multipart или form-urlencoded, без сессии), сервер прячет содержимое в
// одноразовый ящик и отвечает 303 на /share/<токен>; приложение забирает его
// через GET /api/share/:token (нужна сессия, отдаётся ровно один раз).
//
// Лимит — 20 отправок в минуту с адреса. Сервер доверяет одному прокси
// (trust proxy = 1), поэтому адрес берётся из X-Forwarded-For — у каждого теста свой.
import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { shareBody } from "../../schemas/misc";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";

const server = useServer();

const EXPIRED = "Ссылка устарела — поделитесь ещё раз";

let ipCounter = 0;
/** Новый «адрес» клиента для лимита отправок. */
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function shareForm(form: FormData, ip = freshIp()) {
  return new Api(server().baseUrl).request("POST", "/share-target", { form, headers: { "x-forwarded-for": ip } });
}

function shareRaw(body: string, contentType: string, ip = freshIp()) {
  return new Api(server().baseUrl).request("POST", "/share-target", { body, headers: { "content-type": contentType, "x-forwarded-for": ip } });
}

/** Токен из Location: /share/<32 hex>. */
function tokenOf(res: { status: number; headers: Headers; text: string }): string {
  expect(res.status, res.text).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/share\/[0-9a-f]{32}$/);
  return location.slice("/share/".length);
}

describe("POST /share-target → GET /api/share/:token", () => {
  test("multipart: заголовок, текст и ссылка склеиваются, файл — base64; выдаётся один раз", async () => {
    const me = await registerUser(server().baseUrl);
    const bytes = randomBytes(64);
    const form = new FormData();
    form.set("title", "Заголовок");
    form.set("text", "Посмотри");
    form.set("url", "https://example.com/a?b=1");
    form.set("media", new Blob([bytes], { type: "image/png" }), "фото.png");
    const token = tokenOf(await shareForm(form));

    const { share } = expectOk(await me.api.get(`/api/share/${token}`), shareBody);
    expect(share).toEqual({
      text: "Заголовок\nПосмотри\nhttps://example.com/a?b=1",
      url: "https://example.com/a?b=1",
      file: { name: "фото.png", type: "image/png", base64: bytes.toString("base64") },
    });
    // Второй раз — уже нет.
    expectError(await me.api.get(`/api/share/${token}`), 404, EXPIRED);
  });

  test("form-urlencoded: только текст; ссылка не http(s) в url не попадает, но остаётся в тексте", async () => {
    const me = await registerUser(server().baseUrl);
    const body = new URLSearchParams({ text: "  привет  ", url: "ftp://files.example/x" }).toString();
    const token = tokenOf(await shareRaw(body, "application/x-www-form-urlencoded"));
    expect(expectOk(await me.api.get(`/api/share/${token}`), shareBody).share).toEqual({ text: "привет  \nftp://files.example/x", url: null, file: null });
  });

  test("текст обрезается до 8000 символов", async () => {
    const me = await registerUser(server().baseUrl);
    const form = new FormData();
    form.set("text", "я".repeat(9000));
    const token = tokenOf(await shareForm(form));
    expect(expectOk(await me.api.get(`/api/share/${token}`), shareBody).share.text).toBe("я".repeat(8000));
  });

  test("пустой файл без текста — токен всё равно выдаётся, но file: null", async () => {
    const me = await registerUser(server().baseUrl);
    const form = new FormData();
    form.set("file", new Blob([], { type: "text/plain" }), "empty.txt");
    const token = tokenOf(await shareForm(form));
    expect(expectOk(await me.api.get(`/api/share/${token}`), shareBody).share).toEqual({ text: "", url: null, file: null });
  });

  test("нечего отдавать — 303 на главную, без токена", async () => {
    for (const res of [
      await shareForm(new FormData()),
      await shareRaw("", "application/x-www-form-urlencoded"),
      await shareRaw("text=", "application/x-www-form-urlencoded"),
      // JSON разбирается общим express.json раньше маршрута — тело для share-target теряется.
      await shareRaw(JSON.stringify({ text: "привет" }), "application/json"),
    ]) {
      expect(res.status, res.text).toBe(303);
      expect(res.headers.get("location")).toBe("/");
    }
  });

  test("забрать можно только с сессией; токен не привязан к человеку", async () => {
    const { baseUrl } = server();
    const form = new FormData();
    form.set("text", "кому угодно");
    const token = tokenOf(await shareForm(form));

    // Без сессии — 401, и токен при этом не расходуется.
    expectError(await new Api(baseUrl).get(`/api/share/${token}`), 401, "unauthorized");
    const someone = await registerUser(baseUrl);
    expect(expectOk(await someone.api.get(`/api/share/${token}`), shareBody).share.text).toBe("кому угодно");
    expectError(await someone.api.get(`/api/share/${"0".repeat(32)}`), 404, EXPIRED);
    expectError(await someone.api.get("/api/share/whatever"), 404, EXPIRED);
  });

  test("в ящике не больше 30 записей — самые старые вытесняются", async () => {
    const me = await registerUser(server().baseUrl);
    const tokens: string[] = [];
    for (let i = 0; i < 31; i++) {
      const form = new FormData();
      form.set("text", `запись ${i}`);
      tokens.push(tokenOf(await shareForm(form)));
    }
    expectError(await me.api.get(`/api/share/${tokens[0]}`), 404, EXPIRED);
    expect(expectOk(await me.api.get(`/api/share/${tokens[1]}`), shareBody).share.text).toBe("запись 1");
    expect(expectOk(await me.api.get(`/api/share/${tokens[30]}`), shareBody).share.text).toBe("запись 30");
  });

  test("лимит: 20 отправок в минуту с одного адреса, дальше 429 JSON", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) {
      const res = await shareRaw("", "application/x-www-form-urlencoded", ip);
      expect(res.status).toBe(303);
    }
    const blocked = await shareRaw("text=x", "application/x-www-form-urlencoded", ip);
    expectError(blocked, 429, "Слишком много отправок — подождите минуту");
    // Другой адрес не затронут.
    expect((await shareRaw("", "application/x-www-form-urlencoded")).status).toBe(303);
  });
});
