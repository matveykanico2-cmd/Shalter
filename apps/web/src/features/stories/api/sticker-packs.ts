// Свои стикерпаки для наклеек на историю — тот же запрос и тот же ключ кэша, что у панели
// стикеров в чате (features/send-message), так что список общий и второй раз не грузится.
import type { packsListBody } from "@shalter/shared/schemas/stickers";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export const storyStickerPacks = () =>
  queryOptions({
    queryKey: ["stickers", "packs"],
    queryFn: async ({ signal }) => (await http.get<z.infer<typeof packsListBody>>("/api/stickers/packs", signal)).packs,
    staleTime: 60_000,
  });
