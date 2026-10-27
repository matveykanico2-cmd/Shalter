// Фоновый процесс: превью вложений делает не процесс, который отвечает на запросы, а
// дочерний (его pid сервер пишет в лог). Упавший фоновый процесс поднимается снова, а
// задачи, поставленные, пока его не было, лежат в базе и выполняются после подъёма.
// BACKGROUND_WORKER=0 — всё в одном процессе, как раньше.
import { afterAll, describe, expect, test } from "vitest";
import { wsMessageUpdated } from "../../schemas/messages";
import { uploadResult } from "../../schemas/uploads";
import { expectOk, expectShape } from "../../support/expect";
import { createDm, registerUsers, sendText } from "../../support/seed";
import type { TestServer } from "../../support/server";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { upload, uniquePng } from "./helpers";

const withWorker = useServer();
const inline = useServer({ env: { BACKGROUND_WORKER: "0" } });
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

const STARTED = /\[worker\] фоновый процесс запущен \(pid (\d+)\)/g;

function workerPids(server: TestServer): number[] {
  return [...server.log().matchAll(STARTED)].map((m) => Number(m[1]));
}

async function waitUntil(check: () => boolean, what: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function sendPhotoAndWaitPreview(server: TestServer) {
  const [a, b] = await registerUsers(server.baseUrl, 2);
  const dm = await createDm(a, b);
  const bWs = await connectWs(b.api);
  sockets.push(bWs);
  const file = expectOk(await upload(a.api, uniquePng(), { kind: "image", name: "x.png" }), uploadResult);
  const sent = await sendText(a, dm.id, "", { attachments: [{ kind: "image", url: file.url }] });
  expect(sent.attachments).toEqual([{ kind: "image", url: file.url, previewPending: true }]);
  const ev = await bWs.waitFor("message:updated", (e) => e.message?.id === sent.id, 15_000);
  expectShape(wsMessageUpdated, ev);
  expect(ev.message.attachments[0]).toMatchObject({ previewUrl: expect.stringMatching(/^\/uploads\//) });
}

describe("фоновый процесс", () => {
  test("превью делает дочерний процесс; упавший — перезапускается, задачи из очереди не теряются", async (ctx) => {
    const server = withWorker();
    if (!server.dataDir) ctx.skip();
    await waitUntil(() => workerPids(server).length > 0, "запуск фонового процесса");
    const [first] = workerPids(server);
    expect(first).not.toBe(process.pid);

    process.kill(first, "SIGKILL");
    await waitUntil(() => /\[worker\] фоновый процесс завершился/.test(server.log()), "сервер заметил падение");
    // Фоновый процесс поднимется через секунду: задача ляжет в очередь до этого.
    await sendPhotoAndWaitPreview(server);

    const pids = workerPids(server);
    expect(pids.length).toBe(2);
    expect(pids[1]).not.toBe(first);
    // Основной процесс жив и отвечает.
    expect((await fetch(`${server.baseUrl}/api/version`)).status).toBe(200);
  });

  test("BACKGROUND_WORKER=0: дочернего процесса нет, превью делает сам сервер", async (ctx) => {
    const server = inline();
    if (!server.dataDir) ctx.skip();
    await sendPhotoAndWaitPreview(server);
    expect(workerPids(server)).toEqual([]);
  });
});
