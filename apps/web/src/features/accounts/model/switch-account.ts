import { ws } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { switchAccountRequest } from "../api/switch-account";

let switching = false;

/**
 * Переключить аккаунт, как public/js/lib/accountSwitch.js: после ответа сервера страница
 * загружается заново (или открывает to), чтобы ничего от прежнего аккаунта не осталось.
 */
export async function switchAccount(userId: string, { to }: { to?: string } = {}) {
  // Два быстрых нажатия раньше отправляли два запроса и могли загрузить страницу уже
  // под другим аккаунтом, чем тот, по которому нажали последним.
  if (switching) return;
  switching = true;
  document.body.setAttribute("aria-busy", "true");
  try {
    ws.stop();
    await switchAccountRequest(userId);
  } catch (err) {
    switching = false;
    document.body.removeAttribute("aria-busy");
    ws.start();
    toast(errorText(err, "Не удалось переключить аккаунт"), { error: true });
    return;
  }
  // Всегда начинаем с корня: старый URL мог содержать чат или профиль, к которому у
  // нового аккаунта другой доступ. replace также не оставляет смешанный экран в history.
  window.location.replace(to ?? "/");
}
