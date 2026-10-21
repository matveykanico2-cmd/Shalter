import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module.js";

// Перенесённые из server/ модули подключаются сюда.
@Module({ imports: [DbModule] })
export class AppModule {}
