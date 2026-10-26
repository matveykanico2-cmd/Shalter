// Кто за @именем — как openByUsername в public/js/app.js: свой ник — «Избранное»,
// человек или бот — он, иначе канал или группа, иначе никого.
import { queryOptions } from "@tanstack/react-query";

import { findChatByUsername, findUserByUsername, type FoundChat, type FoundUser, openProfileQueries } from "../api/open-profile";

export type Resolved = { kind: "saved" } | { kind: "user"; user: FoundUser } | { kind: "chat"; chat: FoundChat } | { kind: "missing" };

export async function resolveUsername(handle: string, meUsername?: string | null): Promise<Resolved> {
  const name = handle.replace(/^@/, "");
  if (meUsername && meUsername.toLowerCase() === name.toLowerCase()) return { kind: "saved" };
  const user = await findUserByUsername(name).then(
    (r) => r.user,
    () => null
  );
  if (user?.isSelf) return { kind: "saved" };
  if (user) return { kind: "user", user };
  const chat = await findChatByUsername(name).then(
    (r) => r.chat,
    () => null
  );
  return chat ? { kind: "chat", chat } : { kind: "missing" };
}

/** Запрос «кто за @именем» — ключ в кэше рядом с превью чата. */
export const resolveQuery = (handle: string, meUsername: string | null | undefined) =>
  queryOptions({
    queryKey: [...openProfileQueries.baseKey, "resolve", handle.replace(/^@/, "").toLowerCase()],
    queryFn: () => resolveUsername(handle, meUsername),
    staleTime: 0,
  });
