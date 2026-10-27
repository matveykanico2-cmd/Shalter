// GUEST_MODE=0 выключает гостевой вход.
import { test } from "vitest";
import { Api } from "../../support/client";
import { expectError } from "../../support/expect";
import { useServer } from "../../support/use-server";

const server = useServer({ env: { GUEST_MODE: "0" } });

test("гостевой режим выключен — 404", async () => {
  expectError(await new Api(server().baseUrl).post("/api/auth/guest", {}), 404, "Гостевой режим отключён");
});
