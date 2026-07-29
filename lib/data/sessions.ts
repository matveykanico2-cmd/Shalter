import { readCollection, updateCollection } from "./store";
import type { Session } from "../types";

const FILE = "sessions";

export async function listSessions(userId: string): Promise<Session[]> {
  const sessions = await readCollection<Session>(FILE);
  return sessions.filter((s) => s.userId === userId);
}

export async function removeSession(id: string): Promise<void> {
  await updateCollection<Session>(FILE, (sessions) => sessions.filter((s) => s.id !== id));
}

export async function removeOtherSessions(userId: string): Promise<void> {
  await updateCollection<Session>(FILE, (sessions) =>
    sessions.filter((s) => s.userId !== userId || s.current)
  );
}
