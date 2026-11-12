import { lazy, Suspense } from "react";

import { useGameWindows } from "@/entities/game";

// Окна игр — отдельными чанками: на старте они не нужны.
const GamePlayer = lazy(() => import("./game-player").then((m) => ({ default: m.GamePlayer })));
const GameScores = lazy(() => import("./game-scores").then((m) => ({ default: m.GameScores })));
const GamesCatalog = lazy(() => import("./games-catalog").then((m) => ({ default: m.GamesCatalog })));

/** Окна игр в оболочке: каталог, поверх — игра, поверх игры — рекорды. */
export function GamesHost() {
  const { catalog, game, scores } = useGameWindows();
  if (!catalog && !game && !scores) return null;
  return (
    <Suspense fallback={null}>
      {catalog ? <GamesCatalog chatId={catalog.chatId} onPick={catalog.onPick} /> : null}
      {game ? <GamePlayer key={game.id} game={game.game} chatId={game.chatId} /> : null}
      {scores ? <GameScores game={scores.game} chatId={scores.chatId} /> : null}
    </Suspense>
  );
}
