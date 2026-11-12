import { Injectable } from "@nestjs/common";
import type { TimingDto } from "../model/schemas/metrics.schema.js";

/** Сколько последних замеров каждого вида хранить между сводками. */
const MAX_SAMPLES = 5000;

export interface TimingSummary {
  name: string;
  count: number;
  p50: number;
  p90: number;
  p99: number;
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]!;

// Замеры клиентов в памяти до следующей сводки (один API-процесс на data/).
@Injectable()
export class TimingsStore {
  private readonly samples = new Map<string, number[]>();

  public add({ name, ms }: TimingDto) {
    const list = this.samples.get(name) ?? [];
    if (list.length >= MAX_SAMPLES) list.shift();
    list.push(ms);
    this.samples.set(name, list);
  }

  /** Сводка накопленного; накопленное сбрасывается. */
  public drain(): TimingSummary[] {
    const out: TimingSummary[] = [];
    for (const [name, list] of this.samples) {
      if (!list.length) continue;
      const sorted = [...list].sort((a, b) => a - b);
      out.push({ name, count: sorted.length, p50: percentile(sorted, 50), p90: percentile(sorted, 90), p99: percentile(sorted, 99) });
    }
    this.samples.clear();
    return out;
  }
}
