// Shalter AI на GigaChat (GIGACHAT_AUTH_KEY): фото загружается в GigaChat файлом
// (/api/v1/files) и прикладывается к сообщению по id. GigaChat берёт одно изображение
// на сообщение и только JPG/PNG/TIFF/BMP — альбом уходит одним коллажем.
// Адреса GigaChat зашиты в код: их отвечает HTTPS-заглушка за прокси (stubs.ts, tlsHosts).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { aiChatBody } from "../../schemas/integrations";
import { expectOk } from "../../support/expect";
import { registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { upload, uniquePng } from "../uploads/helpers";
import { json, useEgressProxy } from "./stubs";

const egress = useEgressProxy({ tlsHosts: ["ngw.devices.sberbank.ru:9443", "gigachat.devices.sberbank.ru:443"] });
Object.assign(egress.env, { GIGACHAT_AUTH_KEY: "dGVzdDp0ZXN0", HF_VISION_KEYLESS: "off" });
const server = useServer({ env: egress.env });

const AI_ID = "bot_shalter_ai";
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

let fileSeq = 0;
beforeAll(() => {
  const site = egress.tlsSite();
  site.routes.set("/api/v2/oauth", json({ access_token: "giga-token", expires_at: Date.now() + 30 * 60_000 }));
  site.routes.set("/api/v1/files", (_req, res) => json({ id: `file-${++fileSeq}`, object: "file" })(_req, res, ""));
  site.routes.set("/api/v1/chat/completions", json({ choices: [{ message: { role: "assistant", content: "Вижу картинку." }, finish_reason: "stop" }] }));
});

async function startAiChat() {
  const user = await registerUser(server().baseUrl);
  const ws = await connectWs(user.api);
  sockets.push(ws);
  const { chatId } = expectOk(await user.api.post("/api/ai/chat"), aiChatBody);
  await ws.waitFor("message:new", (e) => e.chatId === chatId && e.message.senderId === AI_ID, 10_000);
  return { user, chatId, ws };
}

async function photo(user: TestUser, name: string) {
  const res = await upload(user.api, uniquePng(), { kind: "image", name, mimeType: "image/png" });
  expect(res.status, res.text).toBe(200);
  return res.body;
}

async function ask(s: Awaited<ReturnType<typeof startAiChat>>, text: string, attachments: unknown[]) {
  const site = egress.tlsSite();
  const before = site.hits.length;
  s.ws.clear();
  await sendText(s.user, s.chatId, text, { attachments });
  const reply = await s.ws.waitFor("message:new", (e) => e.chatId === s.chatId && e.message.senderId === AI_ID, 20_000);
  const hits = site.hits.slice(before);
  const uploads = hits.filter((h) => h.path === "/api/v1/files");
  const chat = hits.filter((h) => h.path === "/api/v1/chat/completions").map((h) => JSON.parse(h.body));
  return { reply: reply.message, uploads, chat };
}

describe("Shalter AI — GigaChat", () => {
  test("фото: загружается в GigaChat и прикладывается к сообщению; модель — с поддержкой изображений", async () => {
    const s = await startAiChat();
    const { reply, uploads, chat } = await ask(s, "что на фото?", [await photo(s.user, "cat.png")]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].headers.authorization).toBe("Bearer giga-token");
    expect(uploads[0].raw.toString("latin1")).toContain("Content-Type: image/png");
    expect(chat).toHaveLength(1);
    expect(chat[0].model).toBe("GigaChat-2-Max");
    expect(chat[0].messages.at(-1)).toEqual({ role: "user", content: "что на фото?", attachments: ["file-" + fileSeq] });
    expect(reply.text).toBe("Вижу картинку.");
  });

  test("альбом: одно изображение на сообщение — коллаж JPEG", async () => {
    const s = await startAiChat();
    const { uploads, chat } = await ask(s, "сравни", [await photo(s.user, "a.png"), await photo(s.user, "b.png")]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].raw.toString("latin1")).toContain("Content-Type: image/jpeg");
    expect(chat[0].messages.at(-1).attachments).toHaveLength(1);
  });
});
