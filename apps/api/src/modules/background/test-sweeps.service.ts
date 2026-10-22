import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { workerBridge } from "../../legacy/legacy.js";
import { SweepsService } from "./sweeps.service.js";

// Служебный вызов тестов (POST /api/test/sweeps/:name в server/app.js): проход идёт там же,
// где на боевом сервере, — в фоновом процессе; при BACKGROUND_WORKER=0 — здесь.
@Injectable()
export class TestSweepsService {
  public constructor(private readonly sweeps: SweepsService) {}

  public async run(name: string, rawNow: unknown): Promise<{ ok: true }> {
    if (!this.sweeps.has(name)) throw new ApiError(404, "Нет такого обхода");
    const now = rawNow === undefined ? new Date() : new Date(rawNow as string | number);
    if (Number.isNaN(now.getTime())) throw new ApiError(400, "Некорректное время");
    try {
      if (workerBridge().enabled) await workerBridge().askWorker("sweep", { name, now: now.toISOString() });
      else await this.sweeps.run(name, now);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, (err as Error).message);
    }
    return { ok: true };
  }
}
