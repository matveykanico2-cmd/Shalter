import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { clearCache } from "@/shared/lib/local-cache";
import { askConfirm, toast } from "@/shared/ui";

import { signOut } from "../api/sign-out";

/**
 * Выход — logout/logoutAll из renderAccounts (public/js/views/settings/index.js): после
 * подтверждения. Из текущего аккаунта сокет закрываем сами до запроса: сервер отзывает
 * сеанс и закрывает сокет кодом 4001, а это свой выход, не «сеанс завершён».
 */
export function useSignOut(meId: string) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);

  const run = async (uid: string | undefined, question: string) => {
    if (!(await askConfirm(question, { okLabel: "Выйти", danger: true }))) return;
    const current = uid === undefined || uid === meId;
    setPending(true);
    if (current) ws.stop();
    try {
      const { remaining } = await signOut(uid);
      clearCache();
      if (current && remaining.length) {
        // Остался другой аккаунт — он теперь текущий: страница загружается заново под ним.
        window.location.reload();
        return;
      }
      await client.invalidateQueries({ queryKey: sessionQueries.baseKey });
      // Чаты прежнего аккаунта не должны достаться следующему.
      if (current) client.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionQueries.baseKey[0] });
    } catch (err) {
      // Не вышли — остаёмся в приложении, сокет нужен снова.
      if (current) ws.start();
      toast(errorText(err, "Не удалось выйти"), { error: true });
    } finally {
      setPending(false);
    }
  };

  return {
    pending,
    /** Выйти из аккаунта uid на этом устройстве. */
    signOut: (uid: string) => run(uid, uid === meId ? "Выйти из этого аккаунта?" : "Выйти из этого аккаунта на этом устройстве?"),
    /** Выйти из всех аккаунтов устройства. */
    signOutAll: () => run(undefined, "Выйти из всех аккаунтов на этом устройстве?"),
  };
}
