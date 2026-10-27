// Общие помощники модулей realtime/звонков/контактов/папок. Только HTTP и WS —
// как в support/seed.ts. (Кандидат на перенос в packages/contract-tests/support/.)
import { afterAll, expect } from "vitest";
import type { Api } from "../../support/client";
import type { TestUser } from "../../support/seed";
import { connectWs, type WsClient } from "../../support/ws";

/** Открывает сокеты и закрывает все оставшиеся в afterAll файла. */
export function socketPool(): (api: Api) => Promise<WsClient> {
  const all: WsClient[] = [];
  afterAll(async () => {
    await Promise.all(all.map((s) => s.close()));
  });
  return async (api) => {
    const s = await connectWs(api);
    all.push(s);
    return s;
  };
}

/** Меняет настройки приватности поверх текущих (PATCH /api/settings заменяет privacy целиком). */
export async function setPrivacy(user: TestUser, patch: Record<string, unknown>): Promise<void> {
  const cur = await user.api.get("/api/settings");
  expect(cur.status).toBe(200);
  const res = await user.api.patch("/api/settings", { privacy: { ...cur.body.settings.privacy, ...patch } });
  expect(res.status, res.text).toBe(200);
}

export async function block(user: TestUser, target: TestUser, blocked = true): Promise<void> {
  const res = await user.api.post(`/api/users/${target.id}/block`, { blocked });
  expect(res.status, res.text).toBe(200);
}

export async function addContact(owner: TestUser, target: TestUser, extra: Record<string, unknown> = {}): Promise<any> {
  const res = await owner.api.post("/api/contacts", { userId: target.id, ...extra });
  expect(res.status, res.text).toBe(200);
  return res.body.contact;
}

/** Ждёт закрытия сокета не дольше ms. */
export function closedWithin(ws: WsClient, ms: number): Promise<{ code: number; reason: string }> {
  return Promise.race([
    ws.closed,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`сокет не закрылся за ${ms} мс`)), ms)),
  ]);
}

/** Проверка, что сокет жив: ping → pong. */
export async function expectAlive(ws: WsClient): Promise<void> {
  ws.events.splice(0, ws.events.length, ...ws.events.filter((e) => e.type !== "pong"));
  ws.send({ type: "ping" });
  await ws.waitFor("pong", () => true, 2000);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
