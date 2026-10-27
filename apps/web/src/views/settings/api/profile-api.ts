import type { profileTrackBody, statusActiveBody, statusCatalogBody, statusChangeBody, statusMeBody } from "@shalter/shared/schemas/profile";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type StatusItem = z.infer<typeof statusMeBody>["items"][number];

export const profileQueries = {
  /** Свои статусы (GET /api/status/me). */
  statuses: () => queryOptions({ queryKey: ["profile", "statuses"], queryFn: ({ signal }) => http.get<z.infer<typeof statusMeBody>>("/api/status/me", signal), staleTime: 0 }),
  /** Готовые статусы (GET /api/status-catalog). */
  statusCatalog: () =>
    queryOptions({ queryKey: ["profile", "status-catalog"], queryFn: async ({ signal }) => (await http.get<z.infer<typeof statusCatalogBody>>("/api/status-catalog", signal)).items }),
};

type StatusChange = z.infer<typeof statusChangeBody>;
export const addStatus = (entry: { image: string } | { catalogId: string }) => http.post<StatusChange>("/api/status/me", entry);
export const removeStatus = (id: string) => http.delete<StatusChange>(`/api/status/me/${encodeURIComponent(id)}`);
export const setActiveStatus = (id: string | null) => http.post<z.infer<typeof statusActiveBody>>("/api/status/me/active", { id });

type TrackChange = z.infer<typeof profileTrackBody>;
export const addProfileTrack = (track: { url: string; name?: string; size?: number; mimeType?: string; duration?: number }) => http.post<TrackChange>("/api/profile-track", track);
export const setMainProfileTrack = (index: number) => http.post<TrackChange>(`/api/profile-track/${index}/main`);
export const removeProfileTrack = (index: number) => http.delete<TrackChange>(`/api/profile-track/${index}`);
export const clearProfileTracks = () => http.delete<TrackChange>("/api/profile-track");
