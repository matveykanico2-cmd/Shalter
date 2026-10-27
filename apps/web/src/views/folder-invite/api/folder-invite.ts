import type { folderBody, folderInvite } from "@shalter/shared/schemas/folders";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

const path = (code: string) => `/api/folders/invite/${encodeURIComponent(code)}`;

/** Добавить папку себе: вступить в её публичные чаты (POST …/import). */
export const importFolder = (code: string) => http.post<z.infer<typeof folderBody>>(`${path(code)}/import`);

export const folderInviteQuery = (code: string) =>
  queryOptions({
    queryKey: ["folder-invite", code],
    queryFn: ({ signal }) => http.get<z.infer<typeof folderInvite>>(path(code), signal),
    staleTime: 0,
    retry: false,
  });
