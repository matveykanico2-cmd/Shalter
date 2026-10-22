// Фоновый процесс: очередь задач (превью вложений, видео историй) и обходы по таймеру —
// то, что server/worker.js. Запускает и перезапускает его основной процесс (main.ts через
// server/runtime.js и lib/workerBridge.js), отдельно его запускать не нужно. События для
// клиентов уходят основному: сокеты только там.
import "reflect-metadata";
import dns from "node:dns";
import { NestFactory } from "@nestjs/core";
import { legacyConnection, workerBridge } from "./legacy/legacy.js";
import { BackgroundService } from "./modules/background/background.service.js";
import { WorkerModule } from "./worker.module.js";

for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", () => {});
}
dns.setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");

function shutdown(): never {
  try {
    legacyConnection().close();
  } catch {
    // уже закрыта
  }
  process.exit(0);
}

async function bootstrap() {
  if (!workerBridge().isWorker) {
    console.error("apps/api/dist/worker.js запускает сам сервер (apps/api/dist/main.js), не напрямую");
    process.exit(1);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", () => {}); // Ctrl+C в терминале получает вся группа — ждём SIGTERM от основного
  process.on("disconnect", shutdown);
  // Nest поднимается не сразу, а сообщение основного без слушателя теряется: до старта копим.
  const early: unknown[] = [];
  const keep = (msg: unknown) => early.push(msg);
  process.on("message", keep);
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn"] });
  process.off("message", keep);
  app.get(BackgroundService).startInWorker(early);
}

bootstrap().catch((err) => {
  console.error("[worker] bootstrap failed:", err);
  process.exit(1);
});
