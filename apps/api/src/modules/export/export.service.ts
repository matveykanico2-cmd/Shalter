import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { buildUserExport } from "../../legacy/legacy.js";

// «Экспорт данных» для самого пользователя (право на переносимость) — как server/routes/export.js:
// переписка и манифест вложений; файлы клиент качает сам по ссылкам data.media[].url.
// Выгрузку собирает server/data/dataExport.js (её же зовёт юридический раздел админки).
@Injectable()
export class ExportService {
  public async mine(uid: string) {
    // Чужие телефоны — с учётом их приватности, как в профиле.
    const data = await buildUserExport(uid, { respectPrivacy: true, forSelf: true });
    if (!data) throw new ApiError(404, "Пользователь не найден");
    return { data };
  }
}
