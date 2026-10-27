import { Module } from "@nestjs/common";
import { VersionController } from "./version.controller.js";

// Версия приложения (/api/version).
@Module({ controllers: [VersionController] })
export class VersionModule {}
