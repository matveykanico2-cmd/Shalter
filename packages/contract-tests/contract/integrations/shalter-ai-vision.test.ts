// Shalter AI видит фото и читает файлы: что именно уходит в нейросеть, когда пользователь
// присылает боту фото (с подписью и без, файлом, альбомом, пересланное), текстовый файл.
// Нейросеть — OpenRouter (OPENROUTER_API_KEY): её адрес зашит в код, поэтому весь
// исходящий трафик идёт через прокси-заглушку, а openrouter.ai:443 отвечает локальный
// HTTPS-сервер с тестовым сертификатом (stubs.ts, tlsHosts).
import type http from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { aiChatBody } from "../../schemas/integrations";
import { expectOk } from "../../support/expect";
import { createDm, registerUser, sendText, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { download, upload, uniquePng } from "../uploads/helpers";
import { json, useEgressProxy, type StubSite } from "./stubs";

const FLUX_HOST = "black-forest-labs-flux-1-schnell.hf.space";
const egress = useEgressProxy({ tlsHosts: ["openrouter.ai:443", `${FLUX_HOST}:443`] });
Object.assign(egress.env, {
  OPENROUTER_API_KEY: "test-openrouter-key",
  OPENROUTER_MODEL: "stub/vision:free",
  // Рисование — FLUX (публичное пространство Hugging Face) по своему адресу, за заглушкой.
  FLUX_SPACE_URL: `https://${FLUX_HOST}/gradio_api`,
  // Публичное пространство Hugging Face и рисование в тестах не нужны.
  HF_VISION_KEYLESS: "off",
});
const server = useServer({ env: egress.env });

const AI_ID = "bot_shalter_ai";
const COMPLETIONS = "/api/v1/chat/completions";
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

// Ответ нейросети: потоком (SSE), если просили stream, иначе — JSON.
let replyText = "Вижу картинку.";
beforeAll(() => {
  egress.tlsSite().routes.set(COMPLETIONS, (_req: http.IncomingMessage, res: http.ServerResponse, body: string) => {
    const stream = JSON.parse(body).stream === true;
    if (!stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: replyText }, finish_reason: "stop" }] }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: replyText } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  // FLUX: POST /call/infer → event_id; GET /call/infer/<id> → ссылка на картинку; GET картинки.
  const flux = egress.tlsSite();
  flux.routes.set("/gradio_api/call/infer", json({ event_id: "evt1" }));
  flux.routes.set("/gradio_api/call/infer/evt1", (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`event: complete\ndata: [{"url": "https://${FLUX_HOST}/gradio_api/file=/tmp/flux.png"}]\n\n`);
  });
  flux.routes.set("/gradio_api/file=/tmp/flux.png", (_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fluxImage);
  });
});
const fluxImage = uniquePng(48);

interface Started {
  user: TestUser;
  chatId: string;
  ws: WsClient;
}

async function startAiChat(): Promise<Started> {
  const user = await registerUser(server().baseUrl);
  const ws = await connectWs(user.api);
  sockets.push(ws);
  const { chatId } = expectOk(await user.api.post("/api/ai/chat"), aiChatBody);
  await ws.waitFor("message:new", (e) => e.chatId === chatId && e.message.senderId === AI_ID, 10_000);
  ws.clear();
  return { user, chatId, ws };
}

/** Отправить боту сообщение и дождаться его ответа; вернуть тело запроса к нейросети. */
async function askBot({ user, chatId, ws }: Started, text: string, extra: Record<string, unknown> = {}) {
  const site: StubSite = egress.tlsSite();
  const before = site.hits.length;
  ws.clear();
  await sendText(user, chatId, text, extra);
  const reply = await ws.waitFor("message:new", (e) => e.chatId === chatId && e.message.senderId === AI_ID, 20_000);
  const calls = site.hits.slice(before).filter((h) => h.path === COMPLETIONS);
  expect(calls.length, "запрос к нейросети").toBeGreaterThan(0);
  const request = JSON.parse(calls[0].body);
  return { reply: reply.message, request, lastUser: request.messages.at(-1) };
}

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;
const imagesOf = (message: any): string[] =>
  Array.isArray(message.content) ? message.content.filter((p: any) => p.type === "image_url").map((p: any) => p.image_url.url) : [];
const textOf = (message: any): string =>
  Array.isArray(message.content) ? message.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") : String(message.content);

async function uploaded(user: TestUser, bytes: Buffer, opts: { kind: string; name: string; mimeType?: string }) {
  const res = await upload(user.api, bytes, opts);
  expect(res.status, res.text).toBe(200);
  return res.body;
}

describe("Shalter AI — фото", () => {
  test("фото с подписью: картинка уходит в нейросеть data:URL, подпись — текстом; ответ приходит в чат", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "image", name: "cat.png", mimeType: "image/png" });
    const { reply, request, lastUser } = await askBot(s, "что на фото?", { attachments: [att] });
    expect(request.model).toBe("stub/vision:free");
    expect(lastUser.role).toBe("user");
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
    expect(textOf(lastUser)).toContain("что на фото?");
    expect(reply).toMatchObject({ senderId: AI_ID, text: "Вижу картинку." });
  });

  test("фото без подписи — тоже видно", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "image", name: "photo.png", mimeType: "image/png" });
    const { lastUser } = await askBot(s, "", { attachments: [att] });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
  });

  test("альбом: все фото одного сообщения", async () => {
    const s = await startAiChat();
    const a = uniquePng();
    const b = uniquePng();
    const atts = [
      await uploaded(s.user, a, { kind: "image", name: "a.png", mimeType: "image/png" }),
      await uploaded(s.user, b, { kind: "image", name: "b.png", mimeType: "image/png" }),
    ];
    const { lastUser } = await askBot(s, "сравни", { attachments: atts });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", a), dataUrl("image/png", b)]);
  });

  test("картинка файлом (kind file, image/png) — видно как фото", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "file", name: "scan.png", mimeType: "image/png" });
    const { lastUser } = await askBot(s, "что тут?", { attachments: [att] });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
  });

  test("картинка файлом без типа (браузер не сказал mimeType) — тип по содержимому", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "file", name: "scan.png" });
    const { lastUser } = await askBot(s, "что тут?", { attachments: [att] });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
  });

  test("фото с неверным типом (jpeg по имени, а внутри png) — тип по содержимому", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "image", name: "photo.jpg", mimeType: "image/jpeg" });
    const { lastUser } = await askBot(s, "что тут?", { attachments: [att] });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
  });

  test("пересланное из другого чата фото — видно", async () => {
    const s = await startAiChat();
    const friend = await registerUser(server().baseUrl);
    const dm = await createDm(s.user, friend);
    const png = uniquePng();
    const att = await uploaded(friend, png, { kind: "image", name: "f.png", mimeType: "image/png" });
    const original = await sendText(friend, dm.id, "смотри", { attachments: [att] });
    const { lastUser } = await askBot(s, "", { forwardedFrom: { messageId: original.id } });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
  });

  test("вопрос к фото после ответа бота: фото по-прежнему в запросе", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "image", name: "p.png", mimeType: "image/png" });
    await askBot(s, "что на фото?", { attachments: [att] });
    const { request, lastUser } = await askBot(s, "а какого оно цвета?");
    expect(textOf(lastUser)).toContain("а какого оно цвета?");
    const userTurns = request.messages.filter((m: any) => m.role === "user");
    expect(userTurns.flatMap(imagesOf)).toEqual([dataUrl("image/png", png)]);
  });

  test("стикер-картинка — бот его видит", async () => {
    const s = await startAiChat();
    const png = uniquePng();
    const att = await uploaded(s.user, png, { kind: "image", name: "st.png", mimeType: "image/png" });
    const { lastUser } = await askBot(s, "", { sticker: { kind: "image", url: att.url, emoji: "😺" } });
    expect(imagesOf(lastUser)).toEqual([dataUrl("image/png", png)]);
    expect(textOf(lastUser)).toContain("[стикер 😺]");
  });
});

describe("Shalter AI — файлы", () => {
  test("текстовый файл: содержимое в запросе", async () => {
    const s = await startAiChat();
    const body = Buffer.from(`строка один\nsecret-${Date.now()}\n`, "utf8");
    const att = await uploaded(s.user, body, { kind: "file", name: "notes.txt", mimeType: "text/plain" });
    const { lastUser } = await askBot(s, "перескажи", { attachments: [att] });
    expect(textOf(lastUser)).toContain(body.toString("utf8").trim());
    expect(textOf(lastUser)).toContain("Файл «notes.txt»");
  });

  test("«пришли в .txt» — ответ приходит файлом, его можно скачать", async () => {
    const s = await startAiChat();
    replyText = "Список покупок в файле.\nИМЯ ФАЙЛА: ../shopping list.txt\n```\nмолоко\nхлеб\n```";
    try {
      const { reply, request } = await askBot(s, "составь список покупок и пришли в .txt");
      expect(request.messages[0].content).toContain("ФАЙЛОМ");
      expect(reply.text).toBe("Список покупок в файле.");
      expect(reply.attachments).toEqual([
        { kind: "file", url: expect.stringMatching(/^\/uploads\/sha_[a-f0-9]{16}\.txt$/), name: "shopping.txt", mimeType: "text/plain", size: 22 },
      ]);
      const file = await download(s.user.api, reply.attachments[0].url);
      expect(file.status).toBe(200);
      expect(file.bytes.toString("utf8")).toBe("молоко\nхлеб\n");
    } finally {
      replyText = "Вижу картинку.";
    }
  });

  test("модель не оформила блок — в файл уходит весь ответ", async () => {
    const s = await startAiChat();
    replyText = "a,b\n1,2";
    try {
      const { reply } = await askBot(s, "сделай csv-файл с цифрами");
      expect(reply.attachments).toEqual([expect.objectContaining({ kind: "file", name: "shalter-ai.csv", mimeType: "text/csv" })]);
      expect((await download(s.user.api, reply.attachments[0].url)).bytes.toString("utf8")).toBe("a,b\n1,2\n");
    } finally {
      replyText = "Вижу картинку.";
    }
  });

  test("длинный код в обычном ответе — ещё и файлом целиком", async () => {
    const s = await startAiChat();
    const code = Array.from({ length: 300 }, (_, i) => `print("line ${i}")  # comment`).join("\n");
    replyText = `Вот код:\n\`\`\`python\n${code}\n\`\`\``;
    try {
      await sendText(s.user, s.chatId, "напиши длинный скрипт");
      const file = await s.ws.waitFor(
        "message:new",
        (e) => e.chatId === s.chatId && e.message.senderId === AI_ID && e.message.attachments?.[0]?.kind === "file",
        20_000,
      );
      expect(file.message).toMatchObject({ text: "📄 Код целиком — файлом", attachments: [{ name: "code.py", mimeType: "text/x-python" }] });
      expect((await download(s.user.api, file.message.attachments[0].url)).bytes.toString("utf8")).toBe(`${code}\n`);
    } finally {
      replyText = "Вижу картинку.";
    }
  });
});

describe("Shalter AI — рисование", () => {
  test("«нарисуй …»: промпт от нейросети, картинка от FLUX, в чат — JPEG, который можно скачать", async () => {
    const s = await startAiChat();
    replyText = "a red cat in space, detailed";
    try {
      const site = egress.tlsSite();
      const before = site.hits.length;
      await sendText(s.user, s.chatId, "нарисуй кота в космосе");
      const drawn = await s.ws.waitFor(
        "message:new",
        (e) => e.chatId === s.chatId && e.message.senderId === AI_ID && e.message.attachments?.length,
        20_000,
      );
      const infer = site.hits.slice(before).find((h) => h.path === "/gradio_api/call/infer");
      expect(JSON.parse(infer!.body).data[0]).toBe("a red cat in space, detailed");
      expect(drawn.message.text).toContain("🎨 кота в космосе");
      expect(drawn.message.attachments).toEqual([
        {
          kind: "image",
          url: expect.stringMatching(/^\/uploads\/sha_[a-f0-9]{16}\.jpg$/),
          name: "shalter-ai.jpg",
          mimeType: "image/jpeg",
          size: expect.any(Number),
          aiPrompt: "a red cat in space, detailed",
        },
      ]);
      const file = await download(s.user.api, drawn.message.attachments[0].url);
      expect(file.status).toBe(200);
      expect(file.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    } finally {
      replyText = "Вижу картинку.";
    }
  });
});
