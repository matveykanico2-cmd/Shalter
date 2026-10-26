import { useGameWindows } from "@/entities/game";

import { GamePlayer } from "./game-player";
import { GameScores } from "./game-scores";
import { GamesCatalog } from "./games-catalog";

/** Окна игр в оболочке: каталог, поверх — игра, поверх игры — рекорды. */
export function GamesHost() {
  const { catalog, game, scores } = useGameWindows();
  return (
    <>
      {catalog ? <GamesCatalog chatId={catalog.chatId} onPick={catalog.onPick} /> : null}
      {game ? <GamePlayer key={game.id} game={game.game} chatId={game.chatId} /> : null}
      {scores ? <GameScores game={scores.game} chatId={scores.chatId} /> : null}
    </>
  );
}
