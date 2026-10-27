import { Injectable, type NestMiddleware } from "@nestjs/common";
import express, { type NextFunction, type Request, type Response } from "express";
import { ShareBoxStore } from "./stores/share-box.store.js";

const MAX_BODY_BYTES = 64 * 1024 * 1024;
const rawBody = express.raw({ type: "*/*", limit: MAX_BODY_BYTES });

/** Сначала лимит отправок, потом тело целиком в Buffer (до 64 МБ) — как в server/routes/shareTarget.js. */
@Injectable()
export class ShareTargetBodyMiddleware implements NestMiddleware {
  public constructor(private readonly box: ShareBoxStore) {}

  public use(req: Request, res: Response, next: NextFunction): void {
    if (!this.box.allow(req.ip ?? "?")) {
      res.status(429).json({ error: "Слишком много отправок — подождите минуту" });
      return;
    }
    // Слишком большое или битое тело — 4xx с тем же текстом, что у server/middleware/errors.js.
    rawBody(req, res, (err?: unknown) => {
      const status = Number((err as { status?: unknown } | undefined)?.status);
      if (!err || !(Number.isInteger(status) && status >= 400 && status < 500)) return next(err);
      const type = (err as { type?: string }).type;
      res.status(status).json({ error: type === "entity.too.large" ? "Слишком большой запрос" : "bad request" });
    });
  }
}
