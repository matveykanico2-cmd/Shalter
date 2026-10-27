import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { type SelfUser, sessionQueries } from "../api/session-queries";

/**
 * Поменять себя в кэше сессии — как updateSelf в public/js/state.js: имя, @имя, аватар
 * сразу видны в настройках, меню и панели навигации. Запись в accounts — тоже.
 */
export function useUpdateSelf() {
  const client = useQueryClient();
  return useCallback(
    (patch: Partial<SelfUser>) =>
      client.setQueryData(sessionQueries.current().queryKey, (s) => {
        if (!s?.user) return s;
        const user = { ...s.user, ...patch };
        return { ...s, user, accounts: s.accounts.map((a) => (a.id === user.id ? { ...a, ...patch } : a)) };
      }),
    [client]
  );
}
