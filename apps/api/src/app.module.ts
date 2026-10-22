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
import { UsernamesModule } from "./modules/usernames/usernames.module.js";
import { ChannelsModule } from "./modules/channels/channels.module.js";
import { NearbyModule } from "./modules/nearby/nearby.module.js";
import { GamesModule } from "./modules/games/games.module.js";
import { BotsModule } from "./modules/bots/bots.module.js";
import { GiftsModule } from "./modules/gifts/gifts.module.js";
import { AdsModule } from "./modules/ads/ads.module.js";
import { LiveModule } from "./modules/live/live.module.js";
import { CommunitiesModule } from "./modules/communities/communities.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { VersionModule } from "./modules/version/version.module.js";
import { HugoModule } from "./modules/hugo/hugo.module.js";
import { PartnersModule } from "./modules/partners/partners.module.js";
import { ShortLinksModule } from "./modules/short-links/short-links.module.js";
import { LinkCheckModule } from "./modules/link-check/link-check.module.js";
import { ExportModule } from "./modules/export/export.module.js";
import { SupportModule } from "./modules/support/support.module.js";
import { ShalterAiModule } from "./modules/shalter-ai/shalter-ai.module.js";
import { PremiumModule } from "./modules/premium/premium.module.js";
import { OAuthModule } from "./modules/oauth/oauth.module.js";
import { PostsModule } from "./modules/posts/posts.module.js";
import { DownloadsModule } from "./modules/downloads/downloads.module.js";
import { DonationAlertsModule } from "./modules/donation-alerts/donation-alerts.module.js";
import { MiniAppsModule } from "./modules/mini-apps/mini-apps.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { ShareTargetModule } from "./modules/share-target/share-target.module.js";
import { StoriesModule } from "./modules/stories/stories.module.js";
import { TranslateModule } from "./modules/translate/translate.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { SearchModule } from "./modules/search/search.module.js";
import { SessionsModule } from "./modules/sessions/sessions.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { StarsModule } from "./modules/stars/stars.module.js";
import { TopicsModule } from "./modules/topics/topics.module.js";
import { UploadsModule } from "./modules/uploads/uploads.module.js";

// Перенесённые из server/ модули подключаются сюда.
@Module({
  imports: [DbModule, AuthModule, SessionsModule, RealtimeModule, ChatsModule, TopicsModule, MessagesModule, UploadsModule, CallsModule, ProfilesModule, SettingsModule, ContactsModule, FoldersModule, StarsModule, BootstrapModule, SearchModule, PushModule, StickersModule, UsernamesModule, ChannelsModule, PostsModule, StoriesModule, NearbyModule, HugoModule, PartnersModule, ShortLinksModule, LinkCheckModule, ExportModule, SupportModule, ShalterAiModule, PremiumModule, TranslateModule, DonationAlertsModule, MiniAppsModule, ReportsModule, ShareTargetModule, DownloadsModule, OAuthModule, GamesModule, BotsModule, GiftsModule, AdsModule, LiveModule, CommunitiesModule, AdminModule, VersionModule],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ViewerShapeInterceptor },
  ],
})
export class AppModule {}
