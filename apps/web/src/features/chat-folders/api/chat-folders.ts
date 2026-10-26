import type { folderBody } from "@shalter/shared/schemas/folders";
import type { z } from "zod";

import { http } from "@/shared/api";

type FolderBody = z.infer<typeof folderBody>;
const folderPath = (id: string) => `/api/folders/${encodeURIComponent(id)}`;

export const createFolder = (name: string, chatIds: string[]) => http.post<FolderBody>("/api/folders", { name, chatIds });
export const patchFolder = (id: string, patch: { name?: string; chatIds?: string[]; order?: number }) => http.patch<FolderBody>(folderPath(id), patch);
export const deleteFolder = (id: string) => http.delete<unknown>(folderPath(id));
/** Ссылка-приглашение на папку: в ответе папка с inviteCode (или без него после отзыва). */
export const createFolderInviteLink = (id: string) => http.post<FolderBody>(`${folderPath(id)}/invite-link`);
export const revokeFolderInviteLink = (id: string) => http.delete<FolderBody>(`${folderPath(id)}/invite-link`);
