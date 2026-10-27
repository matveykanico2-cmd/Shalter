import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { workerBridge } from "../../legacy/legacy.js";
import { BackgroundJobsRepository } from "./background-jobs.repository.js";
import type { ClaimedJob, JobHandler } from "./model/domain.js";

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
const POLL_MS = 5000;

// Исполнитель очереди — то же, что startJobRunner в server/lib/backgroundJobs.js: две
// задачи разом, три попытки с паузой в минуту на попытку, опрос раз в 5 секунд. Маршруты
// ставят задачу через queueJob (server/), он же будит исполнитель.
@Injectable()
export class JobRunnerService implements OnApplicationShutdown {
  private handlers: Record<string, JobHandler> | null = null;
  private running = 0;
  private timer: NodeJS.Timeout | undefined;

  public constructor(private readonly jobs: BackgroundJobsRepository) {}

  public start(handlers: Record<string, JobHandler>): void {
    this.handlers = handlers;
    this.jobs.releaseAll();
    // Без фонового процесса (BACKGROUND_WORKER=0) queueJob будит этот исполнитель напрямую.
    workerBridge().onJobsQueued(() => this.drain());
    this.timer = setInterval(() => this.drain(), POLL_MS);
    this.timer.unref();
    this.drain();
  }

  public drain(): void {
    while (this.handlers && this.running < CONCURRENCY) {
      const job = this.jobs.claim();
      if (!job) return;
      this.running += 1;
      void this.run(job).finally(() => {
        this.running -= 1;
        this.drain();
      });
    }
  }

  public onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async run(job: ClaimedJob): Promise<void> {
    const handler = Object.hasOwn(this.handlers!, job.kind) ? this.handlers![job.kind] : undefined;
    try {
      if (!handler) throw new Error(`неизвестный вид задачи ${job.kind}`);
      await handler(job.payload);
      this.jobs.finish(job.id);
    } catch (err) {
      if (job.attempts >= MAX_ATTEMPTS) {
        console.error(`[jobs] ${job.kind} #${job.id} не выполнена за ${job.attempts} попытки, снята:`, err);
        this.jobs.finish(job.id);
      } else {
        console.warn(`[jobs] ${job.kind} #${job.id}, попытка ${job.attempts}:`, (err as Error).message);
        this.jobs.retry(job.id, job.attempts * 60_000);
      }
    }
  }
}
