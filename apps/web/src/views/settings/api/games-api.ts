import { http } from "@/shared/api";

/** Удалить свою игру (DELETE /api/games/:id) — только из «Настройки → Игры». */
export const deleteGame = (id: string) => http.delete(`/api/games/${encodeURIComponent(id)}`);
