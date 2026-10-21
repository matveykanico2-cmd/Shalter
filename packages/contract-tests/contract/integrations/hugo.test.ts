// /api/hugo — проверка орфографии «Хьюго»: LanguageTool по LANGUAGETOOL_URL
// плюс встроенная проверка (lib/localProofread.js). LanguageTool здесь —
// локальный stub, его ответ задаёт каждый тест; при сбое сервис откатывается
// на встроенную проверку.
import { describe, expect, test } from "vitest";
import { hugoCheckBody, hugoInfoBody } from "../../schemas/integrations";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { html, json, useStubSite } from "./stubs";

const env: Record<string, string> = {};
const lt = useStubSite(env, "LANGUAGETOOL_URL", "/v2/check");
const server = useServer({ env });

const LOCAL = "Встроенная проверка";
const check = (api: Api, body: unknown) => api.post("/api/hugo/check", body);
const ltCalls = () => lt().hits.filter((h) => h.path === "/v2/check");

describe("GET /api/hugo", () => {
  test("без сессии — 401", async () => {
    const anon = new Api(server().baseUrl);
    expectError(await anon.get("/api/hugo"), 401, "unauthorized");
    expectError(await anon.post("/api/hugo/check", { text: "x" }), 401, "unauthorized");
  });

  test("описание сервиса: свой LanguageTool, лимит 4000", async () => {
    const u = await registerUser(server().baseUrl);
    expect(expectOk(await u.api.get("/api/hugo"), hugoInfoBody)).toEqual({
      available: true,
      languageTool: true,
      // Не api.languagetool.org — значит, свой сервер.
      selfHosted: true,
      maxText: 4000,
    });
  });
});

describe("POST /api/hugo/check", () => {
  test("пустой текст — пустой список без запроса к LanguageTool и без language", async () => {
    const u = await registerUser(server().baseUrl);
    const before = ltCalls().length;
    for (const body of [{}, { text: "" }, { text: "   " }]) {
      const res = expectOk(await check(u.api, body), hugoCheckBody);
      expect(res).toEqual({ matches: [] });
    }
    expect(ltCalls().length).toBe(before);
  });

  test("длиннее 4000 символов — 413", async () => {
    const u = await registerUser(server().baseUrl);
    expectOk(await check(u.api, { text: "а".repeat(4000) }), hugoCheckBody);
    expectError(await check(u.api, { text: "а".repeat(4001) }), 413, "Слишком длинный текст — максимум 4000 символов");
  });

  test("ответ LanguageTool переводится в matches и дополняется встроенной проверкой", async () => {
    const u = await registerUser(server().baseUrl);
    lt().routes.set(
      "/v2/check",
      json({
        language: { name: "Russian", code: "ru-RU" },
        matches: [
          {
            offset: 0,
            length: 6,
            message: "Возможно, опечатка",
            shortMessage: "",
            replacements: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ value: `вариант${i}` })),
            rule: { issueType: "misspelling", category: { name: "Орфография" } },
          },
          { offset: 7, length: 1, message: "Без правила", replacements: [] },
        ],
      }),
    );
    const text = "Превет я щас приду";
    const res = expectOk(await check(u.api, { text }), hugoCheckBody);
    expect(res.language).toBe("Russian");
    expect(res.matches).toEqual([
      // short — категория, если нет shortMessage; не больше 5 вариантов.
      { offset: 0, length: 6, message: "Возможно, опечатка", short: "Орфография", replacements: ["вариант1", "вариант2", "вариант3", "вариант4", "вариант5"], type: "misspelling" },
      { offset: 7, length: 1, message: "Без правила", short: "", replacements: [], type: "other" },
      // «щас» нашла встроенная проверка — LanguageTool это место не трогал.
      { offset: 9, length: 3, message: "Опечатка: «щас» → «сейчас»", short: "Опечатка", replacements: ["сейчас"], type: "misspelling" },
    ]);
    // Кириллица без явного языка — language=ru, форма как у LanguageTool API.
    const sent = new URLSearchParams(ltCalls().at(-1)!.body);
    expect(sent.get("text")).toBe(text);
    expect(sent.get("language")).toBe("ru");
    expect(sent.get("preferredVariants")).toBeNull();
    expect(ltCalls().at(-1)!.headers["content-type"]).toMatch(/^application\/x-www-form-urlencoded/);
  });

  test("язык: явный передаётся как есть; латиница без языка — auto с preferredVariants; украинский игнорируется", async () => {
    const u = await registerUser(server().baseUrl);
    lt().routes.set("/v2/check", json({ language: { name: "English (US)", code: "en-US" }, matches: [] }));

    expectOk(await check(u.api, { text: "hello", language: "de-DE" }), hugoCheckBody);
    expect(new URLSearchParams(ltCalls().at(-1)!.body).get("language")).toBe("de-DE");

    expect(expectOk(await check(u.api, { text: "hello" }), hugoCheckBody)).toEqual({ matches: [], language: "English (US)" });
    const auto = new URLSearchParams(ltCalls().at(-1)!.body);
    expect(auto.get("language")).toBe("auto");
    expect(auto.get("preferredVariants")).toBe("en-US,de-DE,pt-BR");

    expectOk(await check(u.api, { text: "привет", language: "uk-UA" }), hugoCheckBody);
    expect(new URLSearchParams(ltCalls().at(-1)!.body).get("language")).toBe("ru");
  });

  test("LanguageTool определил украинский — 422", async () => {
    const u = await registerUser(server().baseUrl);
    lt().routes.set("/v2/check", json({ language: { name: "Ukrainian", code: "uk-UA" }, matches: [] }));
    expectError(
      await check(u.api, { text: "привіт" }),
      422,
      "Украинский язык не поддерживается в нашем мессенджере — проверить этот текст не получится",
    );
    lt().routes.set("/v2/check", json({ language: { name: "auto", detectedLanguage: { code: "uk" } }, matches: [] }));
    expectError(await check(u.api, { text: "привіт" }), 422, /^Украинский язык не поддерживается/);
  });

  test("LanguageTool ответил ошибкой или недоступен — встроенная проверка", async () => {
    const u = await registerUser(server().baseUrl);
    lt().routes.set("/v2/check", html("down", {}, 503));
    const res = expectOk(await check(u.api, { text: "я щас приду" }), hugoCheckBody);
    expect(res).toEqual({
      language: LOCAL,
      matches: [{ offset: 2, length: 3, message: "Опечатка: «щас» → «сейчас»", short: "Опечатка", replacements: ["сейчас"], type: "misspelling" }],
    });

    // Не JSON — тоже откат.
    lt().routes.set("/v2/check", html("<html>not json</html>"));
    expect(expectOk(await check(u.api, { text: "привет  мир" }), hugoCheckBody)).toEqual({
      language: LOCAL,
      matches: [{ offset: 6, length: 2, message: "Лишний пробел", short: "Лишний пробел", replacements: [" "], type: "typography" }],
    });
  });

  test("text не строкой приводится к строке", async () => {
    const u = await registerUser(server().baseUrl);
    lt().routes.set("/v2/check", json({ language: { name: "Russian" }, matches: [] }));
    expect(expectOk(await check(u.api, { text: 12345 }), hugoCheckBody)).toEqual({ matches: [], language: "Russian" });
    expect(new URLSearchParams(ltCalls().at(-1)!.body).get("text")).toBe("12345");
  });
});
