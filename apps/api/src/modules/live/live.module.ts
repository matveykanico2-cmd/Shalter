import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { LiveController } from "./live.controller.js";
import { LiveRepository } from "./live.repository.js";
import { LiveService } from "./live.service.js";

// Прямые эфиры (/api/live). Приём из OBS (node-media-server) поднимает runtime в server/,
// маршруты достают его через мост rtmp(). Шлюзу WS нужен LiveRepository: сигналы WebRTC
// эфира пересылаются только между его участниками.
@Module({
  imports: [ChatsModule, UsersModule],
  controllers: [LiveController],
  providers: [LiveService, LiveRepository],
  exports: [LiveRepository],
})
export class LiveModule {}
