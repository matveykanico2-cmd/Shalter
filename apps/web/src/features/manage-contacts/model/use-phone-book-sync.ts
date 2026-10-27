import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { chatQueries } from "@/entities/chat";
import { userQueries } from "@/entities/user";

import { canReadPhoneBook, matchAndAddAll, readPhoneBook } from "../lib/contact-sync";

const START_DELAY_MS = 4000;
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = "shalter.contactSyncAt";

/**
 * В нативном приложении через 4 с после запуска тихо подтянуть новых людей из телефонной
 * книги — не чаще раза в 6 ч (autoSyncPhoneBook в public/js/lib/contactSync.js). В браузере ничего.
 */
export function usePhoneBookSync() {
  const client = useQueryClient();
  useEffect(() => {
    if (!canReadPhoneBook()) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const last = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
          if (Date.now() - last < SYNC_EVERY_MS) return;
        } catch {
          // Хранилище недоступно — синхронизируем.
        }
        const entries = await readPhoneBook({ prompt: true });
        if (!entries.length) return;
        const { added } = await matchAndAddAll(entries);
        if (added) {
          void client.invalidateQueries({ queryKey: userQueries.contacts().queryKey });
          void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
        }
        try {
          localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        } catch {
          // Не запомнили — сверим в следующий запуск ещё раз.
        }
      })().catch(() => {});
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client]);
}
