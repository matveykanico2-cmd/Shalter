import { useQueryClient } from "@tanstack/react-query";

import { sessionQueries } from "@/entities/session";
import { userQueries } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { askText, toast } from "@/shared/ui";

import { addContact, type ContactItem, contactsQueries, removeContact, renameContact, setUserBlocked } from "../api/contacts";

/** Действия со строкой контакта — как кнопки строки в public/js/views/contacts.js. */
export function useContactActions() {
  const client = useQueryClient();
  // Одна инвалидация — и полный список, и списки выбора людей (userQueries.contacts()).
  const refresh = () => client.invalidateQueries({ queryKey: userQueries.contacts().queryKey });

  const add = async (userId: string, localName: string | null) => {
    await addContact(userId, localName);
    await refresh();
  };

  const rename = async (c: ContactItem) => {
    const next = await askText(`Как записать ${c.user.name}?`, { initial: c.localName ?? c.user.name, okLabel: "OK" });
    if (next == null) return;
    try {
      await renameContact(c.userId, next.trim());
    } catch (err) {
      toast(errorText(err, "Не удалось переименовать контакт"), { error: true });
    }
    await refresh();
  };

  const remove = async (userId: string) => {
    // Строка пропадает сразу, сервер — следом.
    client.setQueryData(contactsQueries.list().queryKey, (list) => list?.filter((c) => c.userId !== userId));
    try {
      await removeContact(userId);
    } catch (err) {
      toast(errorText(err, "Не удалось удалить контакт"), { error: true });
    }
    await refresh();
  };

  /** Заблокировать или разблокировать — список заблокированных в сессии меняется сразу. */
  const toggleBlock = async (userId: string) => {
    const key = sessionQueries.current().queryKey;
    const setBlocked = (blocked: boolean) =>
      client.setQueryData(key, (s) => {
        if (!s?.user) return s;
        const ids = s.user.blockedUserIds.filter((id) => id !== userId);
        return { ...s, user: { ...s.user, blockedUserIds: blocked ? [...ids, userId] : ids } };
      });
    const blocked = !client.getQueryData(key)?.user?.blockedUserIds.includes(userId);
    setBlocked(blocked);
    try {
      await setUserBlocked(userId, blocked);
    } catch (err) {
      setBlocked(!blocked);
      toast(errorText(err, "Не удалось изменить блокировку"), { error: true });
    }
  };

  return { add, rename, remove, toggleBlock, refresh };
}
