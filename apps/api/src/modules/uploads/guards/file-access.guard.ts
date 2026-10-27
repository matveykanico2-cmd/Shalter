import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../../common/errors/api-error.js";
import { uploadAccess } from "../../../legacy/legacy.js";
import { SessionCookiesService } from "../../auth/session-cookies.service.js";
import { UPLOAD_FILENAME_RE } from "../lib/upload-name.js";

// Скачать файл может загрузивший, участник чата, где он прикреплён, и купивший платный
// пост (server/lib/uploadAccess.js). Нужна только сессия: бан и время сеанса не
// проверяются, без сессии — всегда «unauthorized». Нет доступа — 404, как у несуществующего.
@Injectable()
export class FileAccessGuard implements CanActivate {
  public constructor(private readonly sessionCookies: SessionCookiesService) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const uid = this.sessionCookies.currentUserId(req);
    if (!uid) throw new ApiError(401, "unauthorized");
    const filename = String(req.params.filename ?? "");
    // Неверное имя файла — 404 без тела, его отдаёт сама отдача файла.
    if (UPLOAD_FILENAME_RE.test(filename) && !uploadAccess().canAccessUpload(uid, filename)) throw new ApiError(404, "not found");
    req.uid = uid;
    return true;
  }
}
