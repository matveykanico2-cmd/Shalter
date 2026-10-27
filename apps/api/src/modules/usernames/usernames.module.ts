import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { UsernameAuctionsRepository } from "./username-auctions.repository.js";
import { UsernameAuctionsService } from "./username-auctions.service.js";
import { UsernameListingsRepository } from "./username-listings.repository.js";
import { UsernameMarketService } from "./username-market.service.js";
import { UsernameAuctionsController, UsernameMarketController } from "./usernames.controller.js";

// Аукционы ников и продажа своего ника (/api/usernames).
@Module({
  imports: [UsersModule],
  controllers: [UsernameMarketController, UsernameAuctionsController],
  providers: [UsernameAuctionsService, UsernameAuctionsRepository, UsernameMarketService, UsernameListingsRepository],
})
export class UsernamesModule {}
