// Первый экран одним запросом (GET /api/bootstrap), как public/js/app.js: чаты и папки
// сразу ложатся в кэш своих запросов, дальше список живёт сам.
import type { bootstrapBody } from "@shalter/shared/schemas/chats";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { chatQueries } from "@/entities/chat";

import { http } from "@/shared/api";

type Bootstrap = z.infer<typeof bootstrapBody>;

export const bootstrapQuery = (client: QueryClient, userId: string) =>
  queryOptions({
    queryKey: ["bootstrap", userId],
    queryFn: async ({ signal }) => {
      const data = await http.get<Bootstrap>("/api/bootstrap", signal);
      client.setQueryData(chatQueries.list().queryKey, data.chats);
      client.setQueryData(chatQueries.folders().queryKey, data.folders);
      return data;
    },
    staleTime: Infinity,
    // Не вышло — список чатов загрузит себя сам.
    retry: false,
  });
