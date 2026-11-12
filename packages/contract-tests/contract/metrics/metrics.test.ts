// Замеры скорости клиента (/api/metrics/timing): время запуска приложения и открытия чата.
// Сервер копит их в памяти и раз в 10 минут пишет в лог процентили — наружу ничего не отдаёт.
import { describe, test } from "vitest";
import { okBody } from "../../schemas/common";
import { expectError, expectOk } from "../../support/expect";
import { registerUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { expectAll401 } from "../stars/helpers";

const server = useServer();

describe("POST /api/metrics/timing", () => {
  test("без входа — 401", async () => {
    await expectAll401(server().baseUrl, [["POST", "/api/metrics/timing"]]);
  });

  test("замер запуска и открытия чата — ok", async () => {
    const me = await registerUser(server().baseUrl);
    expectOk(await me.api.post("/api/metrics/timing", { name: "app-ready", ms: 640 }), okBody);
    expectOk(await me.api.post("/api/metrics/timing", { name: "chat-open", ms: 0 }), okBody);
  });

  test("неизвестный замер, не число, отрицательное или дольше двух минут — 400", async () => {
    const me = await registerUser(server().baseUrl);
    for (const body of [{ name: "other", ms: 1 }, { name: "app-ready", ms: "1" }, { name: "app-ready", ms: -1 }, { name: "chat-open", ms: 120_001 }, {}]) {
      expectError(await me.api.post("/api/metrics/timing", body), 400, "invalid timing");
    }
  });
});
