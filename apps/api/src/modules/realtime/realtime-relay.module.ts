import { Global, Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { SessionsModule } from "../sessions/sessions.module.js";
import { UsersModule } from "../users/users.module.js";
import { RealtimeService } from "./realtime.service.js";
import { SocketRegistry } from "./stores/socket-registry.js";

// RealtimeService фонового процесса (worker.ts): шлюза и сокетов там нет, события уходят
// основному процессу и расходятся его шлюзом. Глобальный, как RealtimeModule.
@Global()
@Module({
  imports: [ChatsModule, UsersModule, SessionsModule],
  providers: [RealtimeService, SocketRegistry],
  exports: [RealtimeService],
})
export class RealtimeRelayModule {}
