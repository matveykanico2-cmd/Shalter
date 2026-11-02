// Кнопки в профиле (profileLinks, как в Telegram): до трёх { title, target }, target —
// «@ник» или https-ссылка. Сохранение, видимость другим, снятие и проверки.
import { describe, expect, test } from "vitest";
import { otherProfileBody, ownProfileBody, patchProfileBody } from "../../schemas/users";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";

const server = useServer();

describe("профиль: PATCH /api/users/:id { profileLinks }", () => {
  test("сохранить (с обрезкой пробелов), увидеть себе и другим, убрать", async () => {
    const { baseUrl } = server();
    const [me, other] = await registerUsers(baseUrl, 2);
    const links = [
      { title: "  Канал ", target: " @shalter_news " },
      { title: "Сайт", target: "https://example.com/path?q=1" },
    ];
    const saved = expectOk(await me.api.patch(`/api/users/${me.id}`, { profileLinks: links }), patchProfileBody).user!;
    const expected = [
      { title: "Канал", target: "@shalter_news" },
      { title: "Сайт", target: "https://example.com/path?q=1" },
    ];
    expect(saved.profileLinks).toEqual(expected);
    expect(expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user.profileLinks).toEqual(expected);
    expect(expectOk(await other.api.get(`/api/users/${me.id}`), otherProfileBody).user.profileLinks).toEqual(expected);

    expect(expectOk(await me.api.patch(`/api/users/${me.id}`, { profileLinks: [] }), patchProfileBody).user!.profileLinks).toEqual([]);
    await me.api.patch(`/api/users/${me.id}`, { profileLinks: links });
    expect(expectOk(await me.api.patch(`/api/users/${me.id}`, { profileLinks: null }), patchProfileBody).user!.profileLinks).toEqual([]);
  });

  test("у нового пользователя кнопок нет", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    expect(expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user.profileLinks).toEqual([]);
  });

  test("неверные кнопки — 400, ничего не сохраняется", async () => {
    const { baseUrl } = server();
    const me = await registerUser(baseUrl);
    const ok = { title: "Ок", target: "@okname" };
    const cases: [unknown, string][] = [
      [[ok, ok, ok, ok], "Не больше 3 кнопок"],
      [[{ title: "   ", target: "@okname" }], "Введите название кнопки"],
      [[{ title: "x".repeat(33), target: "@okname" }], "Название кнопки — не длиннее 32 символов"],
      [[{ title: "Ок", target: "@ab" }], "Кнопка ведёт на @ник или https-ссылку"],
      [[{ title: "Ок", target: "http://example.com" }], "Кнопка ведёт на @ник или https-ссылку"],
      [[{ title: "Ок", target: "javascript:alert(1)" }], "Кнопка ведёт на @ник или https-ссылку"],
      [[{ title: "Ок", target: `https://example.com/${"a".repeat(512)}` }], "Кнопка ведёт на @ник или https-ссылку"],
      ["@okname", "Некорректные кнопки"],
    ];
    for (const [profileLinks, error] of cases) {
      expectError(await me.api.patch(`/api/users/${me.id}`, { profileLinks, bio: "не сохранится" }), 400, error);
    }
    const own = expectOk(await me.api.get(`/api/users/${me.id}`), ownProfileBody).user;
    expect(own.profileLinks).toEqual([]);
    expect(own.bio).toBe("");
  });

  test("чужой профиль — 403", async () => {
    const { baseUrl } = server();
    const [me, other] = await registerUsers(baseUrl, 2);
    expectError(await me.api.patch(`/api/users/${other.id}`, { profileLinks: [{ title: "x", target: "@okname" }] }), 403, "forbidden");
  });
});
