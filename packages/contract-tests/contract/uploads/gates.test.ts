// Загрузка файлов: лимит размера по заявленной длине и заблокированный аккаунт.
// POST /api/uploads и /limits закрыты заблокированному (403 banned), а отдача
// /uploads/:filename бан не проверяет — только сессию и доступ к файлу.
import { describe, expect, test } from "vitest";
import { bannedBody } from "../../schemas/auth";
import { uploadResult } from "../../schemas/uploads";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download, upload, uniqueText } from "./helpers";

const ADMIN_PHONE = "+70000000777";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE, ALLOW_ADMIN_PHONE_SIGNUP: "1" } });
const MB = 1024 ** 2;

let admin: TestUser;
async function getAdmin(): Promise<TestUser> {
  admin ??= await registerUser(server().baseUrl, { phone: ADMIN_PHONE, name: "Админ" });
  return admin;
}

describe("POST /api/uploads: лимит", () => {
  test("заявленная длина больше лимита вида — 413 с названием вида и лимитом, файл не создаётся", async () => {
    const user = await registerUser(server().baseUrl);
    const big = new Uint8Array(20 * MB + 1);
    expectError(await upload(user.api, big, { kind: "avatar", name: "a.png" }), 413, "Фото профиля слишком большой — максимум 20 МБ");
    expectError(await upload(user.api, big, { kind: "gift", name: "g.gif" }), 413, "Гифка подарка слишком большой — максимум 20 МБ");
    // Ровно на лимите — можно.
    const exact = new Uint8Array(20 * MB);
    exact.set(uniqueText(64));
    expectOk(await upload(user.api, exact, { kind: "avatar", name: "a.png" }), uploadResult);
  });
});

describe("заблокированный аккаунт", () => {
  test("загрузка и лимиты — 403 banned, свой файл по-прежнему скачивается", async () => {
    const user = await registerUser(server().baseUrl);
    const bytes = uniqueText();
    const { url } = expectOk(await upload(user.api, bytes, { name: "a.txt" }), uploadResult);

    const banned = await (await getAdmin()).api.post(`/api/admin/users/${user.id}/ban`, { banned: true, reason: "спам" });
    expect(banned.status, banned.text).toBe(200);

    for (const res of [await upload(user.api, uniqueText()), await user.api.get("/api/uploads/limits")]) {
      expect(res.status).toBe(403);
      expect(expectShape(bannedBody, res.body)).toMatchObject({ error: "banned", banReason: "спам" });
    }
    const file = await download(user.api, url);
    expect(file.status).toBe(200);
    expect(file.bytes.equals(bytes)).toBe(true);
  });
});
