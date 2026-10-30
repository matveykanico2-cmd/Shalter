import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatch } from "react-router";

import { openMainMenu } from "@/features/accounts";
import { ChatRowMenu, useChatListActions } from "@/features/chat-actions";
import { CreateCommunityDialog } from "@/features/community-editor";
import { NewChatButton } from "@/features/create-chat";
import { DownloadsDialog } from "@/features/downloads";
import { SearchBox, SearchResults } from "@/features/global-search";
import { NewBotFlow } from "@/features/my-bots";
import { StoriesBar } from "@/features/stories";

import { type ChatFolder, ChatRow, type ChatSummary, chatTitle, hasUnread, sortChats, useChatFolders, useChats } from "@/entities/chat";
import { communityActivity, communityQueries, type JoinedCommunity, setCommunityPanel, useCommunityPanel, useOpenCommunity } from "@/entities/community";
import { useSession } from "@/entities/session";

import { http, useWsEvent } from "@/shared/api";
import { CHAT_TAB_EVENT } from "@/shared/lib/chat-tab-event";
import { errorText } from "@/shared/lib/error-text";
import { useTimeFormat } from "@/shared/lib/time-format";
import { Icon, Menu } from "@/shared/ui";

import { chatsInTab, emptyTextFor, tabsFor } from "../lib/tabs";
import { useChatListSync } from "../model/use-chat-list-sync";
import { useConnectionTitle } from "../model/use-connection-title";
import { useUnreadOnly } from "../model/use-unread-only";

import styles from "./chat-list.module.css";
import { CommunityPanel, CommunityRow } from "./community-panel";

/** Высота строки чата (аватар 54 + отступы 7 + 7); точную меряет виртуализатор. */
const ROW_HEIGHT = 68;

const NO_FOLDERS: ChatFolder[] = [];

type Row = { kind: "archive"; chats: ChatSummary[] } | { kind: "chat"; chat: ChatSummary } | { kind: "community"; community: JoinedCommunity };

const NO_COMMUNITIES: JoinedCommunity[] = [];

/** Список чатов в оболочке: вкладки, архив, «только непрочитанные». Живёт событиями сокета. */
export function ChatList({ meId }: { meId: string }) {
  useChatListSync(meId);
  const chatsQuery = useChats();
  // Сменили 12/24 часа — строки перерисуются с новым временем.
  useTimeFormat();
  const folders = useChatFolders().data ?? NO_FOLDERS;
  const chats = chatsQuery.data;
  const connection = useConnectionTitle();
  const currentId = useMatch("/chat/:chatId")?.params.chatId;

  const [tab, setTab] = useState("all");
  const [showArchive, setShowArchive] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [unreadOnly, toggleUnreadOnly] = useUnreadOnly();
  const me = useSession().data?.user;
  const listActions = useChatListActions();
  const [rowMenu, setRowMenu] = useState<{ chat: ChatSummary; at: { x: number; y: number } } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; at: { x: number; y: number } } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ current: string; latest: string } | null>(null);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    void http
      .get<{ version?: string; currentVersion?: string; latestVersion?: string; latest?: string }>("/api/version")
      .then((res) => {
        if (cancelled) return;
        const current = res.currentVersion ?? res.version ?? "";
        const latest = res.latestVersion ?? res.latest ?? "";
        if (current && latest && current !== latest) {
          setUpdateInfo({ current, latest });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me]);
  // Закреплённые перетаскиваются мышью (makePinnedDraggable): кого тянем и куда встанет.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  // Поиск: запрос уходит, когда набор затих на 150 мс (как в chatList.js).
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 150);
    return () => clearTimeout(t);
  }, [search]);
  const clearSearch = () => {
    setSearch("");
    setQuery("");
  };
  const searching = !!search.trim();

  // Сообщества: строки среди чатов и панель вместо списка (communityList.js).
  const client = useQueryClient();
  const communities = useQuery(communityQueries.joined()).data ?? NO_COMMUNITIES;
  useWsEvent("community:updated", ({ communityId }) => {
    void client.invalidateQueries({ queryKey: communityQueries.detail(communityId).queryKey });
    void client.invalidateQueries({ queryKey: communityQueries.joined().queryKey });
  });
  const panelId = useCommunityPanel();
  const panelCommunity = communities.find((c) => c.id === panelId) ?? null;
  // Чат из сообщества — значок на аватаре строки открывает панель сообщества.
  const communityBadge = (chatId: string) => {
    const cm = communities.find((c) => c.chatIds.includes(chatId));
    return cm ? { title: cm.title, onOpen: () => setCommunityPanel(cm.id) } : null;
  };
  const openCommunity = useOpenCommunity();
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [creatingBot, setCreatingBot] = useState(false);
  // Ушли со списка чатов на другой экран — панель сообщества закрывается (как в chatList.js).
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (pathname !== "/" && !pathname.startsWith("/chat/")) setCommunityPanel(null);
  }, [pathname]);

  const tabs = tabsFor(folders);
  // Ctrl/⌘+1…9 из горячих клавиш оболочки — вкладка по номеру.
  useEffect(() => {
    const onTab = (e: Event) => {
      const t = tabs[(e as CustomEvent<number>).detail];
      if (!t) return;
      setShowArchive(false);
      setTab(t.id);
    };
    window.addEventListener(CHAT_TAB_EVENT, onTab);
    return () => window.removeEventListener(CHAT_TAB_EVENT, onTab);
  }, [tabs]);
  // Папку удалили — возвращаемся на «Все».
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "all";

  const rows = useMemo<Row[]>(() => {
    if (!chats) return [];
    if (showArchive) return sortChats(chats.filter((c) => c.archived)).map((chat) => ({ kind: "chat", chat }));
    let list = sortChats(chatsInTab(activeTab, chats, folders));
    if (unreadOnly) list = list.filter((c) => hasUnread(c) || c.id === currentId);
    const archived = chats.filter((c) => c.archived);
    const head: Row[] = activeTab === "all" && archived.length && !unreadOnly ? [{ kind: "archive", chats: sortChats(archived) }] : [];
    // Сообщества — только во вкладке «Все». В «Группы» и «Каналы» не попадают;
    // открываются только по нажатию на само сообщество (панель / страница сообщества).
    const shown = activeTab === "all" && !unreadOnly ? communities : [];
    const communityChatIds = new Set(communities.flatMap((cm) => cm.chatIds));
    list = list.filter((c) => !communityChatIds.has(c.id) || c.id === currentId);
    const folded = new Set(shown.filter((cm) => cm.collapsed).flatMap((cm) => cm.chatIds));
    if (folded.size) list = list.filter((c) => !folded.has(c.id) || c.id === currentId);
    const notArchived = chats.filter((c) => !c.archived);
    const out: Row[] = [...head, ...shown.filter((cm) => cm.pinned).map((community): Row => ({ kind: "community", community }))];
    const queue = shown
      .filter((cm) => !cm.pinned)
      .map((cm) => ({ cm, at: communityActivity(cm, notArchived) }))
      .sort((a, b) => b.at.localeCompare(a.at));
    const flush = (beforeAt: string | null) => {
      while (queue.length && (beforeAt === null || queue[0]!.at >= beforeAt)) out.push({ kind: "community", community: queue.shift()!.cm });
    };
    for (const chat of list) {
      if (!chat.pinned) flush(chat.lastMessage?.createdAt ?? chat.createdAt ?? "");
      out.push({ kind: "chat", chat });
    }
    flush(null);
    return out;
  }, [chats, folders, activeTab, showArchive, unreadOnly, currentId, communities]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- виртуализатор сам следит за прокруткой
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => {
      const row = rows[i]!;
      return row.kind === "chat" ? row.chat.id : row.kind === "community" ? `community:${row.community.id}` : "archive";
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
      <div className={styles.panel}>
        <div className={connection ? `${styles.titleBar} ${styles.connecting}` : styles.titleBar} role="status" aria-live="polite">
          {connection ? <span className={styles.spinner} /> : null}
          <span>{connection ?? "Shalter"}</span>
        </div>

        <div className={styles.searchRow}>
          {/* Меню ☰ как в tweb (SidebarHeader в chatList.js): аккаунты, разделы, тема. */}

          <button
            type="button"
            className={styles.menuButton}
            title="Меню"
            aria-label="Меню"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMainMenu({ x: r.left, y: r.bottom + 6 });
            }}
          >
            <Icon name="Menu" size={20} />
          </button>
          <SearchBox value={search} onChange={setSearch} onClear={clearSearch} results={() => scrollRef.current} />
          {/* Загрузки — отдельной кнопкой на главном экране, как в chatList.js. */}
          <button type="button" className={styles.menuButton} title="Загрузки" aria-label="Загрузки" onClick={() => setDownloadsOpen(true)}>
            <Icon name="Download" size={20} />
          </button>
        </div>
        {downloadsOpen ? <DownloadsDialog onClose={() => setDownloadsOpen(false)} /> : null}
        {updateInfo ? (
          <a className={styles.updatePill} href="https://github.com/Kilo-Org/kilocode/releases" target="_blank" rel="noreferrer" title={`Обновление: ${updateInfo.current} → ${updateInfo.latest}`}>
            UPDATE
          </a>
        ) : null}

      {/* Полоса историй — между поиском и вкладками, как StoriesBar в chatList.js; пока ищут — скрыта. */}
      {me && !searching ? <StoriesBar me={me} /> : null}

      {searching || panelCommunity ? null : showArchive ? (
        <div className={styles.archiveHead}>
          <button type="button" className={styles.archiveBack} title="Назад к чатам" onClick={() => setShowArchive(false)}>
            <Icon name="ChevronLeft" size={20} />
          </button>
          <span className={styles.archiveTitle}>Архив</span>
          <span className={styles.archiveCount}>{archivedCount ? String(archivedCount) : ""}</span>
        </div>
      ) : (
        <div className={styles.tabsBar}>
          <div className={styles.tabs}>
            {tabs.map((t) => {
              const unread = chats ? chatsInTab(t.id, chats, folders).filter(hasUnread).length : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === activeTab}
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
            className={unreadOnly ? `${styles.filterButton} ${styles.filterOn}` : styles.filterButton}
            title={unreadOnly ? "Показать все чаты" : "Только непрочитанные"}
            aria-pressed={unreadOnly}
            onClick={toggleUnreadOnly}
          >
            <Icon name="Filter" size={16} />
          </button>
        </div>
      )}

      {!searching && panelCommunity ? (
        <CommunityPanel
          community={panelCommunity}
          chats={chats ?? []}
          meId={meId}
          renderChat={(c) => <ChatRow chat={c} meId={meId} onMenu={(at) => setRowMenu({ chat: c, at })} />}
        />
      ) : null}
      <div ref={scrollRef} className={styles.scroll} hidden={!searching && !!panelCommunity}>
        {searching ? (
          query ? (
            <SearchResults
              query={query}
              meId={meId}
              chats={chats ?? []}
              onDone={clearSearch}
              renderChat={(c) => (
                // Открыли найденный чат — поиск закрывается; «⋮» его не трогает.
                <span onClickCapture={(e) => void ((e.target as Element).closest("a") && clearSearch())}>
                  <ChatRow chat={c} meId={meId} onMenu={(at) => setRowMenu({ chat: c, at })} />
                </span>
              )}
            />
          ) : null
        ) : chatsQuery.isPending ? null : chatsQuery.isError && !chats ? (
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
                  ) : row.kind === "community" ? (
                    <CommunityRow community={row.community} chats={chats ?? []} meId={meId} active={panelId === row.community.id} />
                  ) : (
                    <ChatRow
                      chat={row.chat}
                      meId={meId}
                      community={communityBadge(row.chat.id)}
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
      {me && !searching && !showArchive && !panelCommunity ? <NewChatButton me={me} onNewCommunity={() => setCreatingCommunity(true)} onNewBot={() => setCreatingBot(true)} /> : null}
      {creatingBot ? <NewBotFlow onClose={() => setCreatingBot(false)} /> : null}
      {creatingCommunity ? <CreateCommunityDialog onCreated={(c) => void openCommunity(c.id)} onClose={() => setCreatingCommunity(false)} /> : null}
      {rowMenu && me ? <ChatRowMenu chat={rowMenu.chat} me={me} at={rowMenu.at} onClose={() => setRowMenu(null)} /> : null}
      {tabMenu && chats ? <TabMenu at={tabMenu.at} chats={chatsInTab(tabMenu.tabId, chats, folders)} onReadAll={(list) => void listActions.readAll(list)} onClose={() => setTabMenu(null)} /> : null}
      </div>
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
