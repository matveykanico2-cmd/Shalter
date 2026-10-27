import { Global, Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module.js";
import { UsersModule } from "../users/users.module.js";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { SessionUserGuard } from "./guards/session-user.guard.js";
import { PasskeysController } from "./passkeys.controller.js";
import { PasskeysRepository } from "./passkeys.repository.js";
import { PasskeysService } from "./passkeys.service.js";
import { RecoveryController } from "./recovery.controller.js";
import { RecoveryService } from "./recovery.service.js";
import { SessionCookiesService } from "./session-cookies.service.js";
import { SignInService } from "./sign-in.service.js";
import { AuthCodesStore } from "./stores/auth-codes.store.js";
import { QrLoginsStore } from "./stores/qr-logins.store.js";
import { TotpStepsStore } from "./stores/totp-steps.store.js";
import { TwoFactorTicketsStore } from "./stores/two-factor-tickets.store.js";
import { SystemNoticesService } from "./system-notices.service.js";
import { TwoFactorController } from "./two-factor.controller.js";
import { TwoFactorService } from "./two-factor.service.js";

// Вход и аккаунты (/api/auth). Guard входа и cookie сеанса нужны всем модулям, поэтому
// модуль глобальный.
@Global()
@Module({
  imports: [SessionsModule, UsersModule],
  controllers: [AuthController, AccountController, TwoFactorController, PasskeysController, RecoveryController],
  providers: [
    AuthService,
    SignInService,
    AccountService,
    TwoFactorService,
    PasskeysService,
    RecoveryService,
    SystemNoticesService,
    SessionCookiesService,
    PasskeysRepository,
    AuthCodesStore,
    QrLoginsStore,
    TotpStepsStore,
    TwoFactorTicketsStore,
    AuthGuard,
    SessionUserGuard,
  ],
  exports: [AuthService, SessionCookiesService, AuthGuard],
})
export class AuthModule {}
