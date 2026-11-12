// Повтор отправки с тем же clientId после перезапуска сервера: очередь исходящих клиента
// досылает сообщение спустя сколько угодно времени (перезапуск приложения, долгий обрыв),
// и сервер узнаёт отправку по базе, а не по памяти процесса — дубля нет.
import fs from "node:fs";
import path from "node:path";
import { afterAll, expect, test } from "vitest";
import { historyPage, sendResult } from "../../schemas/messages";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { createDm, registerUsers, uniq } from "../../support/seed";
import { startServer, type TestServer } from "../../support/server";
import { msgs } from "./helpers";

const servers: TestServer[] = [];
afterAll(async () => {
  for (const s of servers) await s.stop();
});

test("тот же clientId после перезапуска сервера — то же сообщение, не дубль", async () => {
  const first = await startServer();
  servers.push(first);
  const [a, b] = await registerUsers(first.baseUrl, 2);
  const dm = await createDm(a, b);
  const clientId = uniq("cid");
  const sent = expectOk(await a.api.post(msgs(dm.id), { text: "до перезапуска", clientId }), sendResult);

  servers.splice(servers.indexOf(first), 1);
  await first.stop({ keepData: true });
  const second = await startServer({ seedDataDir: first.dataDir! });
  servers.push(second);
  fs.rmSync(path.dirname(first.dataDir!), { recursive: true, force: true });

  const api = new Api(second.baseUrl);
  for (const [k, v] of a.api.cookies) api.cookies.set(k, v);
  const again = expectOk(await api.post(msgs(dm.id), { text: "до перезапуска", clientId }), sendResult);
  expect(again.message.id).toBe(sent.message.id);
  expect(again.message).not.toHaveProperty("clientId");
  const history = expectOk(await api.get(msgs(dm.id)), historyPage);
  expect(history.messages.map((m) => m.text)).toEqual(["до перезапуска"]);
});
