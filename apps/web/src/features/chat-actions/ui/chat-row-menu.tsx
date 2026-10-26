import { useRef, useState } from "react";

import { type ChatSummary, hasUnread, isChatAdmin, isChatMuted, useChatFolders } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { Menu, type MenuItem } from "@/shared/ui";

import { isServerModerator } from "../lib/permissions";
import { useChatActions } from "../model/use-chat-actions";
import { useFolderActions } from "../model/use-folder-actions";

import { DeleteChatDialog } from "./delete-chat-dialog";
import { MuteDialog } from "./mute-dialog";

type Props = { chat: ChatSummary; me: SelfUser; at: { x: number; y: number }; onClose: () => void };

/** Меню строки списка — правая кнопка, долгое нажатие или «⋮» (openMenu в chatListItem.js). */
export function ChatRowMenu({ chat, me, at, onClose }: Props) {
  const actions = useChatActions(chat, me.id);
  const folderActions = useFolderActions();
  const folders = useChatFolders().data ?? [];
  type Step = "menu" | "folders" | "mute" | "delete";
  const [step, setStepState] = useState<Step>("menu");
  // Меню закрывается раньше, чем сработает пункт: шаг помним сразу, а закрываемся,
  // только если пункт не открыл следующий шаг.
  const stepRef = useRef<Step>("menu");
  const setStep = (next: Step) => {
    stepRef.current = next;
    setStepState(next);
  };
  const muted = isChatMuted(chat);
  const groupLike = chat.type === "group" || chat.type === "channel";

  if (step === "mute") return <MuteDialog onMute={(opts) => void actions.mute(opts)} onClose={onClose} />;
  if (step === "delete") {
    return (
      <DeleteChatDialog
        chat={chat}
        meId={me.id}
        moderator={groupLike && !isChatAdmin(chat, me.id) && isServerModerator(me)}
        onDelete={(forEveryone) =>
          void (async () => {
            if (forEveryone && groupLike && !isChatAdmin(chat, me.id) && !(await actions.confirmModeratorWipe())) return;
            await actions.remove(forEveryone);
          })()
        }
        onLeave={() => void actions.leave()}
        onClose={onClose}
      />
    );
  }
  if (step === "folders") {
    const items: MenuItem[] = folders.map((f) => ({ icon: f.chatIds.includes(chat.id) ? "Check" : "Folder", label: f.name, onClick: () => void folderActions.toggle(f, chat.id) }));
    items.push({ icon: "Plus", label: "Новая папка", onClick: () => void folderActions.createWith(chat.id) });
    return <Menu at={at} label="Добавить в папку" items={items} onClose={onClose} />;
  }

  const items: MenuItem[] = [
    { icon: "Pin", label: chat.pinned ? "Открепить" : "Закрепить", onClick: () => void actions.togglePin() },
    muted
      ? { icon: "Bell", label: "Включить уведомления", onClick: () => void actions.mute({ off: true }) }
      : { icon: "BellOff", label: "Отключить уведомления", onClick: () => setStep("mute") },
    { icon: "Folder", label: "Добавить в папку", onClick: () => setStep("folders") },
    { icon: "Archive", label: chat.archived ? "Вернуть из архива" : "Архивировать", onClick: () => void actions.toggleArchive() },
    hasUnread(chat)
      ? { icon: "Check", label: "Отметить как прочитанное", onClick: () => void actions.markRead() }
      : { icon: "MessageSquare", label: "Отметить как непрочитанное", onClick: () => void actions.markUnread() },
    { icon: "Trash", label: "Удалить чат", danger: true, onClick: () => setStep("delete") },
  ];
  return (
    <Menu
      at={at}
      label="Действия с чатом"
      items={items}
      onClose={() =>
        queueMicrotask(() => {
          if (stepRef.current === "menu") onClose();
        })
      }
    />
  );
}
