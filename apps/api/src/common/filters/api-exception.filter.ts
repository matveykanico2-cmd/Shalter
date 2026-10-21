import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import { ApiError } from "../errors/api-error.js";

// Ошибки в формате старого API (server/middleware/errors.js): тело — { error: "…" }.
// ApiError отдаётся как есть, прочие ошибки клиента 4xx — «bad request», остальное —
// 500 «internal error» и лог.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ApiError) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : Number((exception as { status?: unknown })?.status);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      res.status(status).json({ error: "bad request" });
      return;
    }
    console.error(exception);
    res.status(500).json({ error: "internal error" });
  }
}
