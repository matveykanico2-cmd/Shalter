import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { OAuthController } from "./oauth.controller.js";
import { OAuthRepository } from "./oauth.repository.js";
import { OAuthService } from "./oauth.service.js";

// «Вход через Shalter» (/api/oauth): OAuth 2.0 authorization code для сторонних сайтов.
@Module({
  imports: [UsersModule],
  controllers: [OAuthController],
  providers: [OAuthService, OAuthRepository],
})
export class OAuthModule {}
