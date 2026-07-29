import { cookies } from "next/headers";

const SESSIONS_COOKIE = "session_uids";
const ACTIVE_COOKIE = "active_uid";

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function getSessionUserIds(): Promise<string[]> {
  const store = await cookies();
  return parseIds(store.get(SESSIONS_COOKIE)?.value);
}

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const active = store.get(ACTIVE_COOKIE)?.value ?? null;
  const ids = parseIds(store.get(SESSIONS_COOKIE)?.value);
  if (active && ids.includes(active)) return active;
  return ids[0] ?? null;
}

async function writeSessions(ids: string[], active: string | null) {
  const store = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/" };
  if (ids.length === 0) {
    store.delete(SESSIONS_COOKIE);
    store.delete(ACTIVE_COOKIE);
    return;
  }
  store.set(SESSIONS_COOKIE, JSON.stringify(ids), opts);
  if (active) store.set(ACTIVE_COOKIE, active, opts);
  else store.delete(ACTIVE_COOKIE);
}

// Adds (or switches to, if already present) an account on this browser
// without signing out any other accounts already open — the "add account"
// flow from the nav-rail switcher.
export async function addAccountSession(userId: string) {
  const ids = await getSessionUserIds();
  const next = ids.includes(userId) ? ids : [...ids, userId];
  await writeSessions(next, userId);
}

export async function switchActiveAccount(userId: string) {
  const ids = await getSessionUserIds();
  if (!ids.includes(userId)) return;
  await writeSessions(ids, userId);
}

// Removes one account from this browser's session list. If it was the
// active one, falls back to whichever account is left.
export async function removeAccountSession(userId: string): Promise<string[]> {
  const ids = await getSessionUserIds();
  const next = ids.filter((id) => id !== userId);
  const store = await cookies();
  const active = store.get(ACTIVE_COOKIE)?.value;
  await writeSessions(next, active === userId ? next[0] ?? null : active ?? null);
  return next;
}

export async function clearAllSessions() {
  await writeSessions([], null);
}
