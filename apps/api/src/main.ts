import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { RealtimeService } from "./modules/realtime/realtime.service.js";
import { frontMiddleware } from "./legacy/front.middleware.js";
import { LegacyFallbackAdapter } from "./legacy/legacy-fallback.adapter.js";
import { loadLegacyApp, publicJsonReplacer, startLegacyRuntime } from "./legacy/legacy.js";

async function bootstrap() {
  const legacy = loadLegacyApp();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new LegacyFallbackAdapter(legacy.app), {
    // Тело запроса разбирает общая обработка (server/front.js, лимит 25 МБ); парсер
    // Nest съел бы его раньше, с лимитом 100 КБ.
    bodyParser: false,
    logger: ["error", "warn"],
  });
  // Как у server/app.js: адрес клиента из X-Forwarded-For одного прокси, общий replacer JSON.
  app.set("trust proxy", 1);
  app.set("json replacer", publicJsonReplacer);
  // Раньше маршрутов Nest — тех же заголовков, cookie, тела и лимитов, что у старого приложения.
  app.use(frontMiddleware());
  await app.init();

  // Фоновый процесс, RTMP и остановка по сигналу — как у server/index.js. WebSocket — шлюз
  // Nest (modules/realtime), старый код шлёт события в него.
  await startLegacyRuntime(
    app.getHttpServer(),
    async (port) => {
      await app.listen(port, "0.0.0.0");
      console.log(`shalter server (nest) listening on http://localhost:${port}`);
    },
    app.get(RealtimeService)
  );
}

bootstrap().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
