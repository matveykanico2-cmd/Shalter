// Папки из меню строки чата — openFolderMenu в public/js/components/chatListItem.js.
import { useQueryClient } from "@tanstack/react-query";

import { type ChatFolder, chatQueries } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askText, toast } from "@/shared/ui";

import { createFolder, setFolderChats } from "../api/chat-actions";

export function useFolderActions() {
  const client = useQueryClient();
  const key = chatQueries.folders().queryKey;

  /** Чат в папку или из неё — сразу, при ошибке обратно. */
  const toggle = async (folder: ChatFolder, chatId: string) => {
    const inside = folder.chatIds.includes(chatId);
    const chatIds = inside ? folder.chatIds.filter((id) => id !== chatId) : [...folder.chatIds, chatId];
    const before = client.getQueryData(key);
    client.setQueryData(key, (list) => list?.map((f) => (f.id === folder.id ? { ...f, chatIds } : f)));
    try {
      await setFolderChats(folder.id, chatIds);
    } catch (err) {
      client.setQueryData(key, before);
      toast(errorText(err, "Не удалось изменить папку"), { error: true });
    }
  };

  /** «Новая папка» с этим чатом. */
  const createWith = async (chatId: string) => {
    const name = (await askText("Название папки"))?.trim();
    if (!name) return;
    try {
      const { folder } = await createFolder(name, [chatId]);
      client.setQueryData(key, (list) => [...(list ?? []), folder as ChatFolder]);
    } catch (err) {
      toast(errorText(err, "Не удалось создать папку"), { error: true });
    }
  };

  return { toggle, createWith };
}
