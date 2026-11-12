import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { TimingDto } from "./model/schemas/metrics.schema.js";
import { TimingsStore } from "./stores/timings.store.js";

const REPORT_EVERY_MS = 10 * 60 * 1000;

// Скорость клиента глазами пользователя: раз в 10 минут — строка в лог с процентилями
// (цель — меньше секунды и на запуске, и на открытии чата).
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(private readonly timings: TimingsStore) {}

  public onModuleInit() {
    this.timer = setInterval(() => this.report(), REPORT_EVERY_MS);
    this.timer.unref();
  }

  public onModuleDestroy() {
    clearInterval(this.timer);
  }

  public record(dto: TimingDto) {
    this.timings.add(dto);
    return { ok: true };
  }

  private report() {
    for (const s of this.timings.drain()) console.log(`client timing ${s.name}: n=${s.count} p50=${Math.round(s.p50)}ms p90=${Math.round(s.p90)}ms p99=${Math.round(s.p99)}ms`);
  }
}
