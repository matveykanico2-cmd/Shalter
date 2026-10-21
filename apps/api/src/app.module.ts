import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { ViewerShapeInterceptor } from "./common/interceptors/viewer-shape.interceptor.js";
import { DbModule } from "./modules/db/db.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { ChatsModule } from "./modules/chats/chats.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { SessionsModule } from "./modules/sessions/sessions.module.js";
import { TopicsModule } from "./modules/topics/topics.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";

// Перенесённые из server/ модули подключаются сюда.
@Module({
  imports: [DbModule, AuthModule, SessionsModule, ChatsModule, TopicsModule, MessagesModule, UploadsModule],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ViewerShapeInterceptor },
  ],
})
export class AppModule {}
