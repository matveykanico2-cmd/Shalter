import type { packsListBody } from "@shalter/shared/schemas/stickers";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http, uploadFile } from "@/shared/api";

// Тот же запрос и ключ кэша, что у панели стикеров в чате: список паков общий.
export const constructorStickerPacks = () =>
  queryOptions({
    queryKey: ["stickers", "packs"],
    queryFn: async ({ signal }) => (await http.get<z.infer<typeof packsListBody>>("/api/stickers/packs", signal)).packs,
    staleTime: 60_000,
  });

type AvatarsResult = { user: Record<string, unknown> & { id: string } };

/** Загрузка собранной картинки тем же путём, что и «Фото профиля»: upload kind "avatar" → POST /api/avatars. */
export async function uploadConstructedAvatar(file: File, poster: string) {
  const uploaded = await uploadFile(file, "avatar");
  return http.post<AvatarsResult>("/api/avatars", { url: uploaded.url, kind: "image", poster });
}
