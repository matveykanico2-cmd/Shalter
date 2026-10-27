import { HttpException } from "@nestjs/common";

// Ошибка API с готовым телом ответа в формате старого сервера: { error: "…" }, иногда
// с доп. полями (как у 403 banned). Её бросают сервисы и guard'ы, отвечает ApiExceptionFilter.
export class ApiError extends HttpException {
  public constructor(status: number, error: string, extra: Record<string, unknown> = {}) {
    super({ error, ...extra }, status);
  }
}
