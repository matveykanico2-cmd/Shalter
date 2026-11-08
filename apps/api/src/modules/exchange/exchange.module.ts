import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { ExchangeController } from "./exchange.controller.js";
import { ExchangeRepository } from "./exchange.repository.js";
import { ExchangeService } from "./exchange.service.js";

@Module({ imports: [UsersModule], controllers: [ExchangeController], providers: [ExchangeRepository, ExchangeService] })
export class ExchangeModule {}
