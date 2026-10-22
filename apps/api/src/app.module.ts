import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { ViewerShapeInterceptor } from "./common/interceptors/viewer-shape.interceptor.js";
import { DbModule } from "./modules/db/db.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { BootstrapModule } from "./modules/bootstrap/bootstrap.module.js";
import { CallsModule } from "./modules/calls/calls.module.js";
import { ChatsModule } from "./modules/chats/chats.module.js";
import { ContactsModule } from "./modules/contacts/contacts.module.js";
import { FoldersModule } from "./modules/folders/folders.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { ProfilesModule } from "./modules/profiles/profiles.module.js";
import { PushModule } from "./modules/push/push.module.js";
import { StickersModule } from "./modules/stickers/stickers.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { SearchModule } from "./modules/search/search.module.js";
import { SessionsModule } from "./modules/sessions/sessions.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { StarsModule } from "./modules/stars/stars.module.js";
import { TopicsModule } from "./modules/topics/topics.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";

// Перенесённые из server/ модули подключаются сюда.
@Module({
  imports: [DbModule, AuthModule, SessionsModule, RealtimeModule, ChatsModule, TopicsModule, MessagesModule, UploadsModule, CallsModule, ProfilesModule, SettingsModule, ContactsModule, FoldersModule, StarsModule, BootstrapModule, SearchModule, PushModule, StickersModule],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ViewerShapeInterceptor },
  ],
})
export class AppModule {}
