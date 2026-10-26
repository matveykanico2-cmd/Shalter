import { useState } from "react";

import { type ChatSummary, isChatAdmin, isChatMuted } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { ChoiceDialog, Icon, Menu, type MenuItem } from "@/shared/ui";

import { MUTE_DURATIONS } from "../lib/mute";
import { canModerateDelete, canProtect, isServerModerator } from "../lib/permissions";
import { useChatActions } from "../model/use-chat-actions";

import styles from "./chat-actions.module.css";
import { DeleteChatDialog } from "./delete-chat-dialog";

type Props = {
  chat: ChatSummary;
  me: SelfUser;
  /** Пункты других фич: в начале (темы) и перед «Очистить историю» (запланированные). */
  topItems?: readonly MenuItem[];
  middleItems?: readonly MenuItem[];
};

type Dialog = "mute" | "clear" | "delete" | null;

/** «Ещё» в шапке чата — как меню в renderHeader (public/js/views/chatView.js). */
export function ChatMenu({ chat, me, topItems = [], middleItems = [] }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const actions = useChatActions(chat, me.id);
  const muted = isChatMuted(chat);
  const groupLike = chat.type === "group" || chat.type === "channel";

  const items: MenuItem[] = [
    ...topItems,
    ...(canModerateDelete(chat, me) ? [{ icon: "Trash" as const, label: "Удалить за нарушение", danger: true, onClick: () => void actions.moderateDelete() }] : []),
    muted
      ? { icon: "Bell", label: "Включить уведомления", onClick: () => void actions.mute({ off: true }) }
      : { icon: "BellOff", label: "Отключить уведомления", onClick: () => setDialog("mute") },
    ...(canProtect(chat)
      ? [
          {
            icon: "Lock" as const,
            label: (chat.protectedBy ?? []).includes(me.id) ? "Разрешить пересылку" : "Запретить пересылку",
            onClick: () => void actions.toggleProtect(),
          },
        ]
      : []),
    ...middleItems,
    { icon: "Trash", label: "Очистить историю", onClick: () => setDialog("clear") },
    { icon: "Archive", label: chat.archived ? "Вернуть из архива" : "Архивировать", onClick: () => void actions.toggleArchive() },
    {
      icon: "X",
      label: chat.type === "channel" ? "Канал: выйти или удалить" : chat.type === "group" ? "Группа: выйти или удалить" : "Удалить чат",
      danger: true,
      onClick: () => setDialog("delete"),
    },
  ];

  return (
    <>
      <button
        type="button"
        className={styles.more}
        title="Ещё"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right, y: r.bottom + 4 });
        }}
      >
        <Icon name="More" size={18} />
      </button>
      {at ? <Menu at={at} label="Меню чата" items={items} onClose={() => setAt(null)} /> : null}
      {dialog === "mute" ? (
        <ChoiceDialog
          title="Отключить уведомления"
          choices={[
            ...MUTE_DURATIONS.map((d) => ({ label: d.label, onClick: () => void actions.mute({ hours: d.hours }) })),
            { label: "Навсегда", onClick: () => void actions.mute({ forever: true }) },
          ]}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "clear" ? (
        <ChoiceDialog
          title="Очистить историю чата"
          choices={[
            { label: "Очистить только у себя", onClick: () => void actions.clear(false) },
            { label: "Очистить у всех", danger: true, onClick: () => void actions.clear(true) },
          ]}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "delete" ? (
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
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
