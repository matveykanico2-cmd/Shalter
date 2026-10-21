import { Global, Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { SessionsModule } from "../sessions/sessions.module.js";
import { UsersModule } from "../users/users.module.js";
import { RealtimeService } from "./realtime.service.js";
import { SocketRegistry } from "./stores/socket-registry.js";
import { WsGateway } from "./ws.gateway.js";
import { WsSignalsService } from "./ws-signals.service.js";

// WebSocket /ws: шлюз, реестр сокетов, рассылка событий. RealtimeService нужен почти всем
// модулям (события чатов и сообщений), поэтому модуль глобальный.
@Global()
@Module({
  imports: [ChatsModule, UsersModule, SessionsModule],
  providers: [RealtimeService, SocketRegistry, WsGateway, WsSignalsService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
