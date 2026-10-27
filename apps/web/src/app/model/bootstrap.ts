// Первый экран одним запросом (GET /api/bootstrap), как public/js/app.js: чаты и папки
// сразу ложатся в кэш своих запросов, дальше список живёт сам.
import type { bootstrapBody } from "@shalter/shared/schemas/chats";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { type ChatFolder, chatQueries, type ChatSummary } from "@/entities/chat";
import { type Settings, settingsQueries } from "@/entities/settings";

import { http } from "@/shared/api";
import { readCache, writeCache } from "@/shared/lib/local-cache";

type Bootstrap = z.infer<typeof bootstrapBody>;

export const bootstrapQuery = (client: QueryClient, userId: string) =>
  queryOptions({
    queryKey: ["bootstrap", userId],
    queryFn: async ({ signal }) => {
      const data = await http.get<Bootstrap>("/api/bootstrap", signal).catch((err: unknown) => {
        // Список из прошлого запуска свежим не считается: пусть загрузит себя сам.
        void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
        throw err;
      });
      client.setQueryData(chatQueries.list().queryKey, data.chats);
      client.setQueryData(chatQueries.folders().queryKey, data.folders);
      // Те же настройки, что GET /api/settings (getSettings); схема bootstrap описывает их не целиком.
      client.setQueryData(settingsQueries.current().queryKey, data.settings as unknown as Settings);
      return data;
    },
    staleTime: Infinity,
    // Не вышло — список чатов загрузит себя сам.
    retry: false,
  });

type CachedChats = { chats: ChatSummary[]; folders?: ChatFolder[] };

/**
 * Чаты и папки прошлого запуска (chatList.js: readCache("chats")) — в кэш запросов до ответа
 * /api/bootstrap, чтобы список был на экране сразу. true — есть что показать.
 */
export function restoreCachedChats(client: QueryClient, userId: string) {
  const listKey = chatQueries.list().queryKey;
  if (client.getQueryData(listKey)) return true;
  const cached = readCache<CachedChats>("chats", userId);
  if (!cached?.chats?.length) return false;
  client.setQueryData(listKey, cached.chats);
  if (cached.folders && !client.getQueryData(chatQueries.folders().queryKey)) client.setQueryData(chatQueries.folders().queryKey, cached.folders);
  return true;
}

const PERSIST_DELAY_MS = 1000;

/** Каждое обновление списка или папок — в localStorage (не чаще раза в секунду). Возвращает отписку. */
export function persistChats(client: QueryClient, userId: string) {
  const listKey = chatQueries.list().queryKey;
  const foldersKey = chatQueries.folders().queryKey;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    const chats = client.getQueryData(listKey);
    if (chats) writeCache("chats", userId, { chats, folders: client.getQueryData(foldersKey) ?? [] } satisfies CachedChats);
  };
  const off = client.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success") return;
    const hash = e.query.queryHash;
    if (hash !== JSON.stringify(listKey) && hash !== JSON.stringify(foldersKey)) return;
    timer ??= setTimeout(save, PERSIST_DELAY_MS);
  });
  return () => {
    off();
    if (timer) {
      clearTimeout(timer);
      save();
    }
  };
}
