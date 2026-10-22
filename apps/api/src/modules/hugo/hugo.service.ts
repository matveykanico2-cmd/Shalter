import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { languageTool } from "../../legacy/legacy.js";

// Проверка текста Хьюго (/api/hugo) — как server/routes/hugo.js. Сам запрос к LanguageTool
// остаётся в server/lib/languageTool.js.
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "https://api.languagetool.org/v2/check";

@Injectable()
export class HugoService {
  public info() {
    return {
      available: true,
      languageTool: !!LANGUAGETOOL_URL,
      selfHosted: !/(^|\/\/)api\.languagetool\.org/.test(LANGUAGETOOL_URL),
      maxText: languageTool().MAX_TEXT,
    };
  }

  public async check(text: unknown, language: unknown) {
    const result = await languageTool().checkText(String(text ?? ""), language || "auto");
    if (result.error) throw new ApiError(result.status!, result.error);
    return { matches: result.matches, language: result.language };
  }
}
