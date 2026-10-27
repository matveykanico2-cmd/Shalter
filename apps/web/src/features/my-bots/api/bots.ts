import type { botBody, botCreatedBody, botListBody, broadcastBody, tokenBody } from "@shalter/shared/schemas/bots";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Bot = z.infer<typeof botListBody>["bots"][number];
export type BotPatch = { name: string; description: string; username: string; avatarImage: string | null; appName: string; appUrl: string };

const id = encodeURIComponent;

export const botsQueries = {
  /** Свои боты (GET /api/bots). */
  mine: () =>
    queryOptions({ queryKey: ["bots", "mine"], queryFn: async ({ signal }) => (await http.get<z.infer<typeof botListBody>>("/api/bots", signal)).bots }),
};

export const createBot = (name: string, avatarImage: string | null, description: string) =>
  http.post<z.infer<typeof botCreatedBody>>("/api/bots", { name, avatarImage, description });
export const botToken = (botId: string) => http.get<z.infer<typeof tokenBody>>(`/api/bots/${id(botId)}/token`);
export const regenerateBotToken = (botId: string) => http.post<z.infer<typeof tokenBody>>(`/api/bots/${id(botId)}/regenerate-token`);
export const deleteBot = (botId: string) => http.delete(`/api/bots/${id(botId)}`);
export const updateBot = (botId: string, patch: BotPatch) => http.patch<z.infer<typeof botBody>>(`/api/bots/${id(botId)}`, patch);
export const setBotCommands = (botId: string, commands: { command: string; description: string }[]) => http.put(`/api/bots/${id(botId)}/commands`, { commands });
export const broadcastBot = (botId: string, text: string) => http.post<z.infer<typeof broadcastBody>>(`/api/bots/${id(botId)}/broadcast`, { text });
