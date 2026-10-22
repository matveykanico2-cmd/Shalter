import { Injectable } from "@nestjs/common";
import { TEST_MODE } from "../../common/lib/test-mode.js";
import { initPush, workerBridge } from "../../legacy/legacy.js";
import { JobRunnerService } from "./job-runner.service.js";
import { MediaJobsService } from "./media-jobs.service.js";
import { SweepsService } from "./sweeps.service.js";

interface MainMessage {
  type?: string;
  id?: number;
  name?: string;
  now?: string;
}

// Очередь задач и обходы по таймеру. Обычно — в фоновом процессе (worker.ts, его запускает
// основной: server/runtime.js), при BACKGROUND_WORKER=0 — в основном (main.ts), как в server/.
@Injectable()
export class BackgroundService {
  public constructor(
    private readonly runner: JobRunnerService,
    private readonly media: MediaJobsService,
    private readonly sweeps: SweepsService
  ) {}

  /** Фоновый процесс — то, что server/worker.js: задачи по сигналу основного, затем обходы. early — сообщения основного, пришедшие до старта. */
  public startInWorker(early: unknown[] = []): void {
    this.runner.start(this.media.handlers());
    process.on("message", (msg: MainMessage) => this.onMainMessage(msg));
    for (const msg of early) this.onMainMessage(msg as MainMessage);
    initPush()
      .catch((err: Error) => console.error("[worker] push init failed:", err.message))
      .finally(() => this.sweeps.start(TEST_MODE));
  }

  /** BACKGROUND_WORKER=0: всё в основном процессе. Пуш поднимает server/runtime.js. */
  public startInline(): void {
    this.runner.start(this.media.handlers());
    this.sweeps.start(TEST_MODE);
  }

  private onMainMessage(msg: MainMessage): void {
    if (msg?.type === "jobs") this.runner.drain();
    // Служебный вызов тестов: один проход обхода.
    else if (msg?.type === "sweep" && TEST_MODE) {
      this.sweeps.run(String(msg.name), new Date(msg.now!)).then(
        () => workerBridge().reply(msg.id!),
        (err: Error) => workerBridge().reply(msg.id!, err.message)
      );
    }
  }
}
