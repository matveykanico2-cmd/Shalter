import { Module } from "@nestjs/common";
import { AuthModule } from "./modules/auth/auth.module.js";
import { BackgroundModule } from "./modules/background/background.module.js";
import { DbModule } from "./modules/db/db.module.js";
import { RealtimeRelayModule } from "./modules/realtime/realtime-relay.module.js";

// Фоновый процесс (worker.ts): без HTTP и сокетов, события для клиентов — через основной.
// AuthModule (глобальный) — для guard'ов контроллеров импортированных модулей: Nest
// создаёт их и без HTTP.
@Module({
  imports: [DbModule, AuthModule, RealtimeRelayModule, BackgroundModule],
})
export class WorkerModule {}
