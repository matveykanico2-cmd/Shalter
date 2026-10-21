import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { LegacyFallbackAdapter } from "./legacy-fallback.adapter.js";
import { loadLegacyApp, startLegacyRuntime } from "./legacy.js";

async function bootstrap() {
  const legacy = loadLegacyApp();
  const app = await NestFactory.create(AppModule, new LegacyFallbackAdapter(legacy.app), {
    // Тело запроса разбирает старое приложение (свой лимит 25 МБ); парсер Nest
    // съел бы его раньше, с лимитом 100 КБ.
    bodyParser: false,
    logger: ["error", "warn"],
  });
  await app.init();

  // WebSocket, фоновый процесс, RTMP и остановка по сигналу — как у server/index.js.
  await startLegacyRuntime(app.getHttpServer(), async (port) => {
    await app.listen(port, "0.0.0.0");
    console.log(`shalter server (nest) listening on http://localhost:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("bootstrap failed:", err);
  process.exit(1);
});
