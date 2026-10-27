// Свои стикерпаки (/api/stickers/packs) — окно «Стикерпаки» и выбор стикера в поле ввода.
import type { packBody, packsListBody } from "@shalter/shared/schemas/stickers";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";
import type { Sticker } from "@/shared/lib/anim";

export type StickerPack = Omit<z.infer<typeof packsListBody>["packs"][number], "stickers"> & { stickers: Sticker[] };
export type PackDraft = { name: string; stickers: Sticker[] };

const packsPath = "/api/stickers/packs";

export const stickerPackQueries = {
  baseKey: ["stickers", "packs"] as const,
  list: () =>
    queryOptions({
      queryKey: ["stickers", "packs"],
      queryFn: async ({ signal }) => (await http.get<{ packs: StickerPack[] }>(packsPath, signal)).packs,
      staleTime: 60_000,
    }),
};

export const createStickerPack = (pack: PackDraft) => http.post<z.infer<typeof packBody>>(packsPath, pack);
export const updateStickerPack = (id: string, patch: PackDraft) => http.patch<z.infer<typeof packBody>>(`${packsPath}/${encodeURIComponent(id)}`, patch);
export const deleteStickerPack = (id: string) => http.delete<unknown>(`${packsPath}/${encodeURIComponent(id)}`);
