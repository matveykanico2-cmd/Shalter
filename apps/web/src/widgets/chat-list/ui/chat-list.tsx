import { useVirtualizer } from "@tanstack/react-virtual";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { useMatch } from "react-router";

import { ChatRowMenu, useChatListActions } from "@/features/chat-actions";

import { type ChatFolder, ChatRow, type ChatSummary, chatTitle, hasUnread, sortChats, useChatFolders, useChats } from "@/entities/chat";
import { useSession } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Icon, Menu } from "@/shared/ui";

import { chatsInTab, emptyTextFor, tabsFor } from "../lib/tabs";
import { useChatListSync } from "../model/use-chat-list-sync";
import { useConnectionTitle } from "../model/use-connection-title";
import { useUnreadOnly } from "../model/use-unread-only";

import styles from "./chat-list.module.css";

/** Высота строки чата (аватар 54 + отступы 7 + 7); точную меряет виртуализатор. */
const ROW_HEIGHT = 68;

const NO_FOLDERS: ChatFolder[] = [];

type Row = { kind: "archive"; chats: ChatSummary[] } | { kind: "chat"; chat: ChatSummary };

/** Список чатов в оболочке: вкладки, архив, «только непрочитанные». Живёт событиями сокета. */
export function ChatList({ meId }: { meId: string }) {
  useChatListSync(meId);
  const chatsQuery = useChats();
  const folders = useChatFolders().data ?? NO_FOLDERS;
  const chats = chatsQuery.data;
  const connection = useConnectionTitle();
  const currentId = useMatch("/chat/:chatId")?.params.chatId;

  const [tab, setTab] = useState("all");
  const [showArchive, setShowArchive] = useState(false);
  const [unreadOnly, toggleUnreadOnly] = useUnreadOnly();
  const me = useSession().data?.user;
  const listActions = useChatListActions();
  const [rowMenu, setRowMenu] = useState<{ chat: ChatSummary; at: { x: number; y: number } } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; at: { x: number; y: number } } | null>(null);
  // Закреплённые перетаскиваются мышью (makePinnedDraggable): кого тянем и куда встанет.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);

  const tabs = tabsFor(folders);
  // Папку удалили — возвращаемся на «Все».
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "all";

  const rows = useMemo<Row[]>(() => {
    if (!chats) return [];
    if (showArchive) return sortChats(chats.filter((c) => c.archived)).map((chat) => ({ kind: "chat", chat }));
    let list = sortChats(chatsInTab(activeTab, chats, folders));
    if (unreadOnly) list = list.filter((c) => hasUnread(c) || c.id === currentId);
    const archived = chats.filter((c) => c.archived);
    const head: Row[] = activeTab === "all" && archived.length && !unreadOnly ? [{ kind: "archive", chats: sortChats(archived) }] : [];
    return [...head, ...list.map((chat): Row => ({ kind: "chat", chat }))];
  }, [chats, folders, activeTab, showArchive, unreadOnly, currentId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- виртуализатор сам следит за прокруткой
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => {
      const row = rows[i]!;
      return row.kind === "chat" ? row.chat.id : "archive";
    },
  });

  const archivedCount = chats?.filter((c) => c.archived).length ?? 0;

  const pinnedDrag = (chatId: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragging(chatId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", chatId);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragging || dragging === chatId) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setDropAt({ id: chatId, after: e.clientY > r.top + r.height / 2 });
    },
    onDragLeave: () => setDropAt((d) => (d?.id === chatId ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const target = dropAt;
      setDropAt(null);
      if (dragging && target && dragging !== chatId) void listActions.reorderPinned(dragging, chatId, target.after);
    },
    onDragEnd: () => {
      setDragging(null);
      setDropAt(null);
    },
  });

  return (
    <div className={styles.pane}>
      <div className={connection ? `${styles.titleBar} ${styles.connecting}` : styles.titleBar} role="status" aria-live="polite">
        {connection ? <span className={styles.spinner} /> : null}
        <span>{connection ?? "Shalter"}</span>
      </div>

      {showArchive ? (
        <div className={styles.archiveHead}>
          <button type="button" className={styles.iconButton} title="Назад к чатам" onClick={() => setShowArchive(false)}>
            <Icon name="ChevronLeft" size={20} />
          </button>
          <span className={styles.archiveTitle}>Архив</span>
          <span className={styles.archiveCount}>{archivedCount ? String(archivedCount) : ""}</span>
        </div>
      ) : (
        <div className={styles.tabsBar}>
          <div className={styles.tabs} role="tablist">
            {tabs.map((t) => {
              const unread = chats ? chatsInTab(t.id, chats, folders).filter(hasUnread).length : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === activeTab}
                  className={t.id === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                  onClick={() => setTab(t.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ tabId: t.id, at: { x: e.clientX, y: e.clientY } });
                  }}
                >
                  {t.name}
                  {unread ? <span className={styles.tabCount}>{unread}</span> : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={unreadOnly ? `${styles.iconButton} ${styles.filterOn}` : styles.iconButton}
            title={unreadOnly ? "Показать все чаты" : "Только непрочитанные"}
            aria-pressed={unreadOnly}
            onClick={toggleUnreadOnly}
          >
            <Icon name="Filter" size={16} />
          </button>
        </div>
      )}

      <div ref={scrollRef} className={styles.scroll}>
        {chatsQuery.isPending ? null : chatsQuery.isError && !chats ? (
          <p className={styles.error} role="alert">
            {errorText(chatsQuery.error)}
          </p>
        ) : rows.length === 0 ? (
          <Empty title={showArchive ? null : unreadOnly ? "Всё прочитано" : "Здесь пока пусто"} text={emptyText(showArchive, unreadOnly, activeTab, folders)} />
        ) : (
          <div className={styles.rows} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]!;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className={[styles.rowSlot, dropAt && row.kind === "chat" && dropAt.id === row.chat.id ? (dropAt.after ? styles.dropAfter : styles.dropBefore) : ""].filter(Boolean).join(" ")}
                  style={{ transform: `translateY(${item.start}px)` }}
                  {...(row.kind === "chat" && row.chat.pinned ? pinnedDrag(row.chat.id) : {})}
                >
                  {row.kind === "archive" ? (
                    <ArchiveRow chats={row.chats} onOpen={() => setShowArchive(true)} />
                  ) : (
                    <ChatRow
                      chat={row.chat}
                      meId={meId}
                      onMenu={(at) => setRowMenu({ chat: row.chat, at })}
                      onSwipe={(action) => void (action === "mute" ? listActions.toggleMute(row.chat) : listActions.toggleArchive(row.chat))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {rowMenu && me ? <ChatRowMenu chat={rowMenu.chat} me={me} at={rowMenu.at} onClose={() => setRowMenu(null)} /> : null}
      {tabMenu && chats ? <TabMenu at={tabMenu.at} chats={chatsInTab(tabMenu.tabId, chats, folders)} onReadAll={(list) => void listActions.readAll(list)} onClose={() => setTabMenu(null)} /> : null}
    </div>
  );
}

/** Правая кнопка на вкладке — «Прочитать все (N)», как openTabMenu в chatList.js. */
function TabMenu({ at, chats, onReadAll, onClose }: { at: { x: number; y: number }; chats: readonly ChatSummary[]; onReadAll: (list: readonly ChatSummary[]) => void; onClose: () => void }) {
  const unread = chats.filter(hasUnread);
  return (
    <Menu
      at={at}
      label="Вкладка"
      items={[{ icon: "CheckCheck", label: unread.length ? `Прочитать все (${unread.length})` : "Всё прочитано", onClick: unread.length ? () => onReadAll(unread) : undefined }]}
      onClose={onClose}
    />
  );
}

function emptyText(archive: boolean, unreadOnly: boolean, tab: string, folders: readonly ChatFolder[]) {
  if (archive) return "В архиве пусто";
  if (unreadOnly) return "Непрочитанных чатов здесь нет — фильтр можно выключить кнопкой справа от вкладок";
  return emptyTextFor(tab, folders);
}

function Empty({ title, text }: { title: string | null; text: string }) {
  return (
    <div className={styles.empty}>
      {title ? <p className={styles.emptyTitle}>{title}</p> : null}
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}

/** Строка «Архив» над чатами вкладки «Все»: имена архивных чатов и сколько в них непрочитанных. */
function ArchiveRow({ chats, onOpen }: { chats: ChatSummary[]; onOpen: () => void }) {
  const unread = chats.filter(hasUnread).length;
  return (
    <button type="button" className={styles.archiveRow} onClick={onOpen}>
      <span className={styles.archiveIcon}>
        <Icon name="Archive" size={24} />
      </span>
      <span className={styles.archiveBody}>
        <span className={styles.archiveName}>Архив</span>
        <span className={styles.archiveLine}>
          <span className={styles.archiveNames}>{chats.map(chatTitle).filter(Boolean).join(", ")}</span>
          {unread ? <span className={styles.archiveUnread}>{unread}</span> : null}
        </span>
      </span>
    </button>
  );
}
