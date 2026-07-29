import { readCollection, updateCollection } from "./store";
import type { Call } from "../types";

const FILE = "calls";

export async function listCalls(userId: string): Promise<Call[]> {
  const calls = await readCollection<Call>(FILE);
  return calls
    .filter((c) => c.participantIds.includes(userId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getCall(id: string): Promise<Call | undefined> {
  const calls = await readCollection<Call>(FILE);
  return calls.find((c) => c.id === id);
}

export async function createCall(call: Call): Promise<Call> {
  await updateCollection<Call>(FILE, (calls) => [...calls, call]);
  return call;
}

export async function updateCall(id: string, patch: Partial<Call>): Promise<Call | undefined> {
  let updated: Call | undefined;
  await updateCollection<Call>(FILE, (calls) =>
    calls.map((c) => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch };
      return updated;
    })
  );
  return updated;
}
