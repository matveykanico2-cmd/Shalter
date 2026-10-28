import type { partnerInfoBody } from "@shalter/shared/schemas/reports";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export const partnersQueries = {
  /** Условия партнёрской программы (GET /api/partners/me). */
  me: () => queryOptions({ queryKey: ["partners", "me"], queryFn: ({ signal }) => http.get<z.infer<typeof partnerInfoBody>>("/api/partners/me", signal) }),
};

/** Личка с администрацией по партнёрке. */
export const openPartnerChat = () => http.post<{ chatId: string }>("/api/partners/chat");

/** Админ: список всех партнёров (GET /api/partners/admin/list). */
export const listPartners = () => http.get<{ id: string; userId: string; username: string; name: string; bio: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string; createdBy: string; createdAt: string; updatedAt: string }[]>("/api/partners/admin/list");

/** Админ: создать партнёра (POST /api/partners/admin/create). */
export const createPartner = (dto: { userId: string; username: string; name: string; bio?: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string }) =>
  http.post<{ id: string; userId: string; username: string; name: string; bio: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string; createdBy: string; createdAt: string; updatedAt: string }>("/api/partners/admin/create", dto);

/** Админ: обновить партнёра (POST /api/partners/admin/update/:id). */
export const updatePartner = (id: string, dto: { username?: string; name?: string; bio?: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string }) =>
  http.post<{ id: string; userId: string; username: string; name: string; bio: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string; createdBy: string; createdAt: string; updatedAt: string }>(`/api/partners/admin/update/${id}`, dto);

/** Админ: удалить партнёра (DELETE /api/partners/admin/delete/:id). */
export const deletePartner = (id: string) => http.delete<{ ok: true }>(`/api/partners/admin/delete/${id}`);

/** Публично: партнёр по username (GET /api/partners/:username). */
export const getPartnerByUsername = (username: string) => http.get<{ id: string; userId: string; username: string; name: string; bio: string; avatarUrl?: string; bannerUrl?: string; linkUrl?: string; createdBy: string; createdAt: string; updatedAt: string }>(`/api/partners/${username}`);
