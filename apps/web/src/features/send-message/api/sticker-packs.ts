// Свои стикерпаки (/api/stickers/packs) — окно «Стикерпаки» и выбор стикера в поле ввода.
import type { packBody,packsListBody } from "@shalter/shared/schemas/stickers";
import type { Sticker } from "@shalter/shared/schemas/stickers";
import { stickerPack } from "@shalter/shared/schemas/stickers";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type StickerPack = z.infer<typeof stickerPack>;
export type PackDraft = { name: string; description?: string | null };

const packsPath = "/api/stickers/packs";

export const stickerPackQueries = {
  baseKey: ["stickers", "packs"] as const,
  /** Паки пользователя (свои + добавленные в коллекцию) с is_added и sticker_count. */
  list: () =>
    queryOptions({
      queryKey: ["stickers", "packs"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof packsListBody>>(packsPath, signal)).packs,
      staleTime: 60_000,
    }),
  /** Один пак со стикерами, sticker_count и is_added. */
  get: (id: string) =>
    queryOptions({
      queryKey: ["stickers", "packs", id],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof packBody>>(`${packsPath}/${encodeURIComponent(id)}`, signal)).pack,
      staleTime: 60_000,
    }),
};

export const createStickerPack = (pack: PackDraft) => http.post<z.infer<typeof packBody>>(packsPath, pack);
export const updateStickerPack = (id: string, patch: { name?: string; description?: string | null }) =>
  http.patch<z.infer<typeof packBody>>(`${packsPath}/${encodeURIComponent(id)}`, patch);
export const deleteStickerPack = (id: string) => http.delete<{ ok: boolean }>(`${packsPath}/${encodeURIComponent(id)}`);

export const addSticker = (packId: string, { file, emoji, position }: { file: string; emoji: string; position?: number }) =>
  http.post<{ sticker: Sticker }>(`${packsPath}/${encodeURIComponent(packId)}/stickers`, { file, emoji, ...(position !== undefined ? { position } : {}) });
export const updateSticker = (packId: string, stickerId: string, { emoji, position }: { emoji?: string; position?: number }) =>
  http.patch<{ sticker: Sticker }>(`${packsPath}/${encodeURIComponent(packId)}/stickers/${encodeURIComponent(stickerId)}`, { emoji, position });
export const removeSticker = (packId: string, stickerId: string) =>
  http.delete<{ ok: boolean }>(`${packsPath}/${encodeURIComponent(packId)}/stickers/${encodeURIComponent(stickerId)}`);

export const addStickerPackToCollection = (packId: string) => http.post<{ ok: boolean }>(`${packsPath}/${encodeURIComponent(packId)}/collection`);
export const removeStickerPackFromCollection = (packId: string) => http.delete<{ ok: boolean }>(`${packsPath}/${encodeURIComponent(packId)}/collection`);
