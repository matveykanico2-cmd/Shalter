import { useState } from "react";

import { ChatRowMenu, useChatListActions } from "@/features/chat-actions";

import { ChatRow, type ChatSummary, sortChats, useChats } from "@/entities/chat";
import { useSession } from "@/entities/session";

import { useCloseSidePanel } from "@/shared/lib/side-panel";
import { Icon } from "@/shared/ui";

import styles from "./archive-view.module.css";

/** /archive — заархивированные чаты с тем же меню строки, что в списке (public/js/views/archive.js). */
export function ArchiveView() {
  const close = useCloseSidePanel();
  const me = useSession().data?.user;
  const chats = useChats();
  const listActions = useChatListActions();
  const [rowMenu, setRowMenu] = useState<{ chat: ChatSummary; at: { x: number; y: number } } | null>(null);
  const archived = sortChats((chats.data ?? []).filter((c) => c.archived));

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={close}>
          <Icon name="ChevronLeft" size={20} />
        </button>
        <h1 className={styles.title}>Архив</h1>
      </header>
      <div className={styles.list}>
        {!me || chats.isPending ? null : archived.length === 0 ? (
          <p className={styles.empty}>В архиве пусто — потяните строку чата влево или нажмите «⋮» → «Архивировать»</p>
        ) : (
          <>
            <p className={styles.section}>В архиве — {archived.length}</p>
            <p className={styles.hint}>Чаты с включёнными уведомлениями возвращаются из архива, когда в них приходит новое сообщение. Заглушённые остаются здесь.</p>
            {archived.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                meId={me.id}
                onMenu={(at) => setRowMenu({ chat: c, at })}
                onSwipe={(action) => void (action === "mute" ? listActions.toggleMute(c) : listActions.toggleArchive(c))}
              />
            ))}
          </>
        )}
      </div>
      {rowMenu && me ? <ChatRowMenu chat={rowMenu.chat} me={me} at={rowMenu.at} onClose={() => setRowMenu(null)} /> : null}
    </div>
  );
}
