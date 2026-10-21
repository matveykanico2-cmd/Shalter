// Админский номер без ALLOW_ADMIN_PHONE_SIGNUP: регистрация на него выглядит
// как «номер занят» — номер не подтверждается, а права админа даются по номеру.
import { describe, test } from "vitest";
import { Api } from "../../support/client";
import { expectError } from "../../support/expect";
import { uniq } from "../../support/seed";
import { useServer } from "../../support/use-server";

const ADMIN_PHONE = "+70000000778";
const server = useServer({ env: { PREMIUM_ADMIN_PHONE: ADMIN_PHONE } });

describe("POST /api/auth/register-email на админский номер", () => {
  test("409 «номер уже существует», даже если аккаунта с ним нет", async () => {
    const username = uniq("adm");
    const res = await new Api(server().baseUrl).post("/api/auth/register-email", {
      name: "Не админ",
      email: `${username}@test.invalid`,
      password: "secret123",
      phone: ADMIN_PHONE,
      username,
    });
    expectError(res, 409, "Аккаунт с таким номером телефона уже существует");
  });
});
