import { useState } from "react";

import { gameApi } from "@/entities/game";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import { GameTokenDialog } from "../ui/game-token-dialog";

/**
 * Токен Game API (showGameToken в games.js): подтверждение — новый отзывает прежний, —
 * потом показ один раз. Возвращает токен или null.
 */
export async function createGameToken(game: { id: string; title: string }) {
  if (!(await askConfirm(`Создать API-токен для «${game.title}»? Прежний токен (если был) перестанет работать.`, { okLabel: "Создать" }))) return null;
  try {
    return (await gameApi.createToken(game.id)).token;
  } catch (err) {
    toast(errorText(err, "Не удалось создать токен"), { error: true });
    return null;
  }
}

/** Кнопка-сценарий целиком: «API-токен» → подтверждение → окно с токеном. */
export function useGameToken() {
  const [token, setToken] = useState<string | null>(null);
  return {
    show: async (game: { id: string; title: string }) => setToken(await createGameToken(game)),
    dialog: token ? <GameTokenDialog token={token} onClose={() => setToken(null)} /> : null,
  };
}
