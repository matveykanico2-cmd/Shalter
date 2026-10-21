import { Global, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module.js";
import { AuthUsersRepository } from "./auth-users.repository.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { SessionCookiesService } from "./session-cookies.service.js";

// Guard входа и cookie сеанса нужны всем модулям, поэтому модуль глобальный.
@Global()
@Module({
  imports: [SessionsModule],
  providers: [AuthService, AuthUsersRepository, SessionCookiesService, AuthGuard],
  exports: [AuthService, SessionCookiesService, AuthGuard],
})
export class AuthModule {}
