// Помощники для тестов звонков: только через HTTP, как клиент.
import { expect } from "vitest";
import { expectOk } from "../../support/expect";
import type { TestUser } from "../../support/seed";
import { callBody, type Call } from "../../schemas/calls";

export async function startCall(user: TestUser, chatId: string, extra: Record<string, unknown> = {}): Promise<Call> {
  return expectOk(await user.api.post("/api/calls", { chatId, kind: "voice", ...extra }), callBody).call;
}

export async function patchCall(user: TestUser, callId: string, patch: Record<string, unknown>): Promise<Call> {
  return expectOk(await user.api.patch(`/api/calls/${callId}`, patch), callBody).call;
}

export async function addToCall(user: TestUser, callId: string, target: TestUser): Promise<Call> {
  return expectOk(await user.api.post(`/api/calls/${callId}/participants`, { userId: target.id }), callBody).call;
}

export function sameIds(actual: string[], expected: string[]) {
  expect([...actual].sort()).toEqual([...expected].sort());
}
