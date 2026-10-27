// Гостевой вход: POST /api/auth/guest — аккаунт без телефона, почты и пароля.
import { expect, test } from "vitest";
import { loginBody, sessionBody } from "../../schemas/auth";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { useServer } from "../../support/use-server";

const server = useServer();

test("создаёт гостя с сессией; каждый вызов — новый аккаунт", async () => {
  const api = new Api(server().baseUrl);
  const body = expectOk(await api.post("/api/auth/guest", {}), loginBody);
  expect(body.alreadyLinked).toBe(false);
  expect(body.user).toMatchObject({ isGuest: true, phone: "", blockedUserIds: [] });
  expect(body.user.name).toMatch(/^Гость \d{4}$/);
  expect(body.user.username).toMatch(/^guest_[0-9a-f]{10}$/);
  expect(body.user.email).toBeUndefined();

  const session = expectOk(await api.get("/api/auth/session"), sessionBody);
  expect(session.user?.id).toBe(body.user.id);
  expect((await api.get("/api/chats")).status).toBe(200);

  const other = expectOk(await new Api(server().baseUrl).post("/api/auth/guest", {}), loginBody);
  expect(other.user.id).not.toBe(body.user.id);
  expect(other.user.username).not.toBe(body.user.username);
});
