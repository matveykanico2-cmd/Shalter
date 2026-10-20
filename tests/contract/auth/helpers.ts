// Общие помощники модуля авторизации: чтение служебного чата «Shalter»
// (коды входа и оповещения безопасности приходят туда) и писем из outbox.
import fs from "node:fs";
import path from "node:path";
import type { Api } from "../../support/client";

/** Фиксированный id системного бота (server/data/systemBot.js). */
export const SYSTEM_BOT_ID = "bot_shalter";

export async function systemChat(api: Api): Promise<any | null> {
  const res = await api.get("/api/chats");
  if (res.status !== 200) throw new Error(`список чатов: ${res.status} ${res.text.slice(0, 300)}`);
  return res.body.chats.find((c: any) => c.type === "dm" && c.memberIds.includes(SYSTEM_BOT_ID)) ?? null;
}

/** Все сообщения служебного чата (по возрастанию времени); [] — если чата ещё нет. */
export async function systemMessages(api: Api): Promise<any[]> {
  const chat = await systemChat(api);
  if (!chat) return [];
  const res = await api.get(`/api/chats/${chat.id}/messages`, { query: { limit: 200 } });
  if (res.status !== 200) throw new Error(`сообщения: ${res.status} ${res.text.slice(0, 300)}`);
  return res.body.messages;
}

/** Ждёт сообщение от системного бота, подходящее под pred (опрос раз в 50 мс). */
export async function waitSystemMessage(api: Api, pred: (text: string) => boolean, timeoutMs = 3000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = (await systemMessages(api)).filter((m) => m.senderId === SYSTEM_BOT_ID && pred(m.text ?? "")).at(-1);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error("не дождались сообщения от системного бота");
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Последний шестизначный код из сообщения бота, начинающегося с prefix. */
export async function lastCode(api: Api, prefix: string): Promise<string> {
  const msg = await waitSystemMessage(api, (t) => t.startsWith(prefix));
  const m = /(\d{6})/.exec(msg.text);
  if (!m) throw new Error(`в сообщении нет кода: ${msg.text}`);
  return m[1];
}

/** Сколько сообщений бота с таким началом уже лежит в чате. */
export async function countSystem(api: Api, pred: (text: string) => boolean): Promise<number> {
  return (await systemMessages(api)).filter((m) => m.senderId === SYSTEM_BOT_ID && pred(m.text ?? "")).length;
}

export interface OutboxMail {
  file: string;
  to: string;
  subject: string;
  text: string;
}

export function readOutbox(dataDir: string): OutboxMail[] {
  const dir = path.join(dataDir, "outbox");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".eml"))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const [head, ...rest] = raw.split("\n\n");
      const header = (k: string) => new RegExp(`^${k}: (.*)$`, "m").exec(head)?.[1] ?? "";
      return { file: f, to: header("To"), subject: header("Subject"), text: rest.join("\n\n") };
    });
}

/** Ждёт письмо на адрес to (письма отправляются без ожидания ответа маршрута). */
export async function waitMail(dataDir: string, to: string, timeoutMs = 3000): Promise<OutboxMail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = readOutbox(dataDir).find((m) => m.to === to);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error(`письмо для ${to} не появилось в outbox`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Шестизначный код из последнего письма на адрес to с темой subject. Маршруты,
 * которые шлют код письмом, ждут отправку до ответа — письмо уже в outbox.
 */
export function lastMailCode(dataDir: string, to: string, subject: string): string {
  const mail = readOutbox(dataDir).filter((m) => m.to === to && m.subject === subject).at(-1);
  if (!mail) throw new Error(`нет письма «${subject}» для ${to}`);
  const m = /(\d{6})/.exec(mail.text);
  if (!m) throw new Error(`в письме нет кода: ${mail.text}`);
  return m[1];
}
