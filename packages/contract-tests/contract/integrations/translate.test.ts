// /api/translate — перевод сообщений и /api/translate/batch — перевод строк
// интерфейса. Сервер ходит в translate.googleapis.com по зашитому адресу (env нет),
// поэтому успешный ответ в тестах получить нельзя: весь исходящий трафик идёт
// в прокси-заглушку (stubs.ts), который https-туннель не пропускает. Фиксируются
// проверки входа и контракт «сервис недоступен».
import { describe, expect, test } from "vitest";
import { translateBatchBody } from "../../schemas/integrations";
import { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { useEgressProxy } from "./stubs";

const egress = useEgressProxy();
const server = useServer({ env: egress.env });

const UNSUPPORTED = "Украинский язык не поддерживается в нашем мессенджере";
const UNAVAILABLE = "Сервис перевода сейчас недоступен, попробуйте позже";

describe("POST /api/translate", () => {
  test("без сессии — 401", async () => {
    const anon = new Api(server().baseUrl);
    expectError(await anon.post("/api/translate", { text: "привет", target: "en" }), 401, "unauthorized");
    expectError(await anon.post("/api/translate/batch", { texts: ["привет"], target: "en" }), 401, "unauthorized");
  });

  test("проверки: пустой текст, нет языка, украинский", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.post("/api/translate", {}), 400, "Нечего переводить");
    expectError(await u.api.post("/api/translate", { text: "   ", target: "en" }), 400, "Нечего переводить");
    expectError(await u.api.post("/api/translate", { text: "привет" }), 400, "Не указан язык перевода");
    expectError(await u.api.post("/api/translate", { text: "привет", target: "  " }), 400, "Не указан язык перевода");
    for (const target of ["uk", "UK", "uk-UA", "uk_UA"]) {
      expectError(await u.api.post("/api/translate", { text: "привет", target }), 400, UNSUPPORTED);
    }
    expect(egress.proxy().connects).toEqual([]);
  });

  test("не строки в text/target — 400", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.post("/api/translate", { text: 5, target: "en" }), 400, "Некорректный текст");
    expectError(await u.api.post("/api/translate", { text: "привет", target: 5 }), 400, "Не указан язык перевода");
  });

  test("сервис недоступен — 502; запрос шёл в translate.googleapis.com", async () => {
    const u = await registerUser(server().baseUrl);
    const before = egress.proxy().connects.length;
    expectError(await u.api.post("/api/translate", { text: "привет", target: "en" }), 502, UNAVAILABLE);
    expect(egress.proxy().connects.slice(before)).toEqual(["translate.googleapis.com:443"]);
  });
});

describe("POST /api/translate/batch", () => {
  test("проверки: texts — непустой массив, язык, украинский, не больше 300 строк", async () => {
    const u = await registerUser(server().baseUrl);
    const err = "texts must be a non-empty array";
    for (const body of [{}, { texts: "привет", target: "en" }, { texts: [], target: "en" }]) {
      expectError(await u.api.post("/api/translate/batch", body), 400, err);
    }
    expectError(await u.api.post("/api/translate/batch", { texts: ["a"] }), 400, "Не указан язык перевода");
    expectError(await u.api.post("/api/translate/batch", { texts: ["a"], target: "uk-UA" }), 400, UNSUPPORTED);
    expectError(
      await u.api.post("/api/translate/batch", { texts: Array.from({ length: 301 }, (_, i) => `s${i}`), target: "en" }),
      400,
      "Слишком много строк за один запрос (максимум 300)",
    );
    // Ровно 300 пустых строк — можно (и переводить нечего).
    const ok = expectOk(await u.api.post("/api/translate/batch", { texts: Array.from({ length: 300 }, () => ""), target: "en" }), translateBatchBody);
    expect(ok.translations).toHaveLength(300);
  });

  test("пустые и пробельные строки возвращаются пустыми без запроса наружу (null — тоже пустая)", async () => {
    const u = await registerUser(server().baseUrl);
    const before = egress.proxy().connects.length;
    const res = expectOk(await u.api.post("/api/translate/batch", { texts: ["", "   ", null], target: "EN" }), translateBatchBody);
    expect(res).toEqual({ translations: ["", "", ""] });
    expect(egress.proxy().connects.length).toBe(before);
  });

  test("сервис недоступен — 200, null на месте каждой непереведённой строки", async () => {
    const u = await registerUser(server().baseUrl);
    const before = egress.proxy().connects.length;
    const res = expectOk(
      await u.api.post("/api/translate/batch", { texts: ["Привет", "", "Пока", "Привет", 42], target: "en" }),
      translateBatchBody,
    );
    // Позиции сохраняются, пустая строка остаётся "", дубликаты переводятся один раз.
    expect(res).toEqual({ translations: [null, "", null, null, null] });
    const tried = egress.proxy().connects.slice(before);
    expect(tried.length).toBeGreaterThan(0);
    expect(new Set(tried)).toEqual(new Set(["translate.googleapis.com:443"]));
  });

  test("target не строкой — 400", async () => {
    const u = await registerUser(server().baseUrl);
    expectError(await u.api.post("/api/translate/batch", { texts: ["a"], target: 1 }), 400, "Не указан язык перевода");
  });
});
