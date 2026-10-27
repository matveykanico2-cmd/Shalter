import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { GameApiController } from "./game-api.controller.js";
import { GameApiService } from "./game-api.service.js";
import { GamesController } from "./games.controller.js";
import { GamesRepository } from "./games.repository.js";
import { GamesService } from "./games.service.js";
import { GameTokenGuard } from "./guards/game-token.guard.js";

// Игры (/api/games) и Game API для их разработчиков (/api/game-api). Bot API в server/ пишет в те
// же таблицы через server/data/games.js. GamesService нужен поиску.
@Module({
  imports: [ChatsModule, UsersModule],
  controllers: [GamesController, GameApiController],
  providers: [GamesService, GameApiService, GamesRepository, GameTokenGuard],
  exports: [GamesService],
})
export class GamesModule {}
