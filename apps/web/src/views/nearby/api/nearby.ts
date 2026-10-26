import type { nearbyBody } from "@shalter/shared/schemas/nearby";
import type { z } from "zod";

import { http } from "@/shared/api";

export type NearbyUser = z.infer<typeof nearbyBody>["users"][number];

/** Показаться рядом (координаты огрубляет сервер) — в ответ те, кто рядом. */
export const shareNearbyLocation = (lat: number, lng: number) => http.post<z.infer<typeof nearbyBody>>("/api/nearby", { lat, lng });

export const stopNearbySharing = () => http.delete<unknown>("/api/nearby");
