import { ws } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { switchAccountRequest } from "../api/switch-account";

/**
 * Переключить аккаунт, как public/js/lib/accountSwitch.js: после ответа сервера страница
 * загружается заново (или открывает to), чтобы ничего от прежнего аккаунта не осталось.
 */
export async function switchAccount(userId: string, { to }: { to?: string } = {}) {
  document.body.setAttribute("aria-busy", "true");
  try {
    ws.stop();
    await switchAccountRequest(userId);
  } catch (err) {
    document.body.removeAttribute("aria-busy");
    ws.start();
    toast(errorText(err, "Не удалось переключить аккаунт"), { error: true });
    return;
  }
  if (to) window.location.href = to;
  else window.location.reload();
}
