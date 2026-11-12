import { clearOfflineApi, readCache, writeCache } from "@/shared/lib/local-cache";

import type { Session } from "../api/session-queries";

// Кто был в приложении в прошлый запуск: приложение открывается сразу под ним, а
// GET /api/auth/session проверяет это параллельно с /api/bootstrap (а не до него).
// Лежит в общем кэше (shared/lib/local-cache): выход и удаление аккаунта его стирают.
const NAME = "session";
const OWNER = "last";

export const readLastSession = (): Session | undefined => readCache<Session>(NAME, OWNER) ?? undefined;

export function writeLastSession(session: Session) {
  writeCache(NAME, OWNER, session.user ? session : null);
}

/** Перед переключением аккаунта: следующий запуск ждёт ответа сервера, а не открывается под прежним. */
export function forgetLastSession() {
  writeCache(NAME, OWNER, null);
  clearOfflineApi();
}
