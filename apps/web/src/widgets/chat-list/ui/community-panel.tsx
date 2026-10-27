import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router";

import { MuteDialog } from "@/features/chat-actions";
import { AddChatFlow, CommunitySettingsDialog, RequestsDialog, useCommunityActions } from "@/features/community-editor";

import { chatPreview, chatQueries, type ChatSummary, hasUnread, isChatMuted, sortChats, timeLabel } from "@/entities/chat";
import {
  chatMembersLabel,
  chatsCountLabel,
  type Community,
  communityApi,
  CommunityAvatar,
  type CommunityChat,
  communityMembersLabel,
  communityQueries,
  isCommunityMuted,
  type JoinedCommunity,
  memberChatsOf,
  setCommunityPanel,
  useOpenCommunity,
} from "@/entities/community";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { publicUrl } from "@/shared/lib/public-link";
import { Avatar, Icon, Menu, type MenuItem, toast } from "@/shared/ui";

import styles from "./community-panel.module.css";

type Point = { x: number; y: number };
type Dialogs = { kind: "mute" } | { kind: "settings" } | { kind: "requests"; community: Community } | null;

/** Пункты меню сообщества — communityMenuItems в communityList.js. */
function useCommunityMenu(community: JoinedCommunity & { requestsCount: number }, chats: readonly ChatSummary[], { inPanel = false } = {}) {
  const client = useQueryClient();
  const actions = useCommunityActions();
  const openCommunity = useOpenCommunity();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    try {
      await fn();
      await actions.refresh(community.id);
      void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
    } catch (err) {
      toast(errorText(err, fallback), { error: true });
    }
  };
  const muted = isCommunityMuted(community, chats);
  const unread = memberChatsOf(community, chats).some(hasUnread);
  const editable = community.rights.editInfo || community.rights.editChats;
  const items: MenuItem[] = [
    ...(inPanel ? [] : [{ icon: "Layers" as const, label: "Открыть сообщество", onClick: () => void openCommunity(community.id) }]),
    { icon: "Pin", label: community.pinned ? "Открепить" : "Закрепить", onClick: () => void run(() => communityApi.prefs(community.id, { pinned: !community.pinned }), "Не удалось закрепить") },
    muted
      ? { icon: "VolumeOff", label: "Включить уведомления", onClick: () => void run(() => communityApi.mute(community.id, { off: true }), "Не удалось включить уведомления") }
      : { icon: "Volume", label: "Отключить уведомления", onClick: () => setDialog({ kind: "mute" }) },
    ...(unread ? [{ icon: "Check" as const, label: "Отметить как прочитанное", onClick: () => void run(() => communityApi.read(community.id), "Не удалось отметить прочитанным") }] : []),
    {
      icon: "Layers",
      label: community.collapsed ? "Показывать чаты отдельно" : "Показывать одной строкой",
      onClick: () => void run(() => communityApi.prefs(community.id, { collapsed: !community.collapsed }), "Не удалось изменить вид"),
    },
    { icon: "Link", label: "Скопировать ссылку", onClick: () => void copyText(publicUrl(`/community/${community.id}`), "Ссылка скопирована") },
    { icon: editable ? "Edit" : "Users", label: editable ? "Изменить сообщество" : "О сообществе", onClick: () => setDialog({ kind: "settings" }) },
    ...(community.requestsCount
      ? [
          {
            icon: "Inbox" as const,
            label: `Заявки (${community.requestsCount})`,
            onClick: () =>
              void client
                .fetchQuery(communityQueries.detail(community.id))
                .then((c) => setDialog({ kind: "requests", community: c }))
                .catch((err: unknown) => toast(errorText(err, "Не удалось загрузить сообщество"), { error: true })),
          },
        ]
      : []),
    community.isOwner
      ? { icon: "Trash", label: "Удалить сообщество", danger: true, onClick: () => void actions.remove(community) }
      : { icon: "LogOut", label: "Покинуть сообщество", danger: true, onClick: () => void actions.leave(community) },
  ];
  const dialogs = (meId: string) =>
    dialog?.kind === "mute" ? (
      <MuteDialog onMute={(opts) => void run(() => communityApi.mute(community.id, opts), "Не удалось отключить уведомления")} onClose={() => setDialog(null)} />
    ) : dialog?.kind === "settings" ? (
      <CommunitySettingsDialog communityId={community.id} meId={meId} onClose={() => setDialog(null)} />
    ) : dialog?.kind === "requests" ? (
      <RequestsDialog community={dialog.community} onChanged={() => void actions.refresh(community.id)} onClose={() => setDialog(null)} />
    ) : null;
  return { items, dialogs };
}

type RowProps = { community: JoinedCommunity; chats: readonly ChatSummary[]; meId: string; active: boolean };

/** Строка сообщества в списке чатов — CommunityRow: последнее сообщение «Чат: текст». */
export function CommunityRow({ community, chats, meId, active }: RowProps) {
  const openCommunity = useOpenCommunity();
  const [menuAt, setMenuAt] = useState<Point | null>(null);
  const menu = useCommunityMenu(community, chats);
  const mine = memberChatsOf(community, chats);
  const latest = [...mine].sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""))[0];
  const unread = mine.filter((c) => !isChatMuted(c)).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const total = unread + mine.filter(isChatMuted).reduce((n, c) => n + (c.unreadCount || 0), 0);
  const mention = mine.some((c) => c.hasUnreadMention);
  const muted = isCommunityMuted(community, chats);
  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAt({ x: r.right - 8, y: r.bottom + 2 });
  };
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={active ? `${styles.row} ${styles.active}` : styles.row}
        onClick={() => void openCommunity(community.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <CommunityAvatar community={community} size={54} />
        <span className={styles.body}>
          <span className={styles.line}>
            <span className={styles.title}>{community.title}</span>
            <span className={styles.time}>{latest?.lastMessage ? timeLabel(latest.lastMessage.createdAt) : ""}</span>
          </span>
          <span className={styles.line}>
            <span className={styles.preview}>
              {latest?.lastMessage ? (
                <>
                  <span className={styles.previewChat}>{`${latest.title ?? ""}: `}</span>
                  {chatPreview(latest, meId).text}
                </>
              ) : (
                chatsCountLabel(community.chatIds.length)
              )}
            </span>
            <span className={styles.badges}>
              {community.pinned ? <Icon name="Pin" size={12} /> : null}
              <Icon name={muted ? "VolumeOff" : "Volume"} size={12} className={styles.sound} />
              {community.requestsCount ? <span className={styles.requestsDot} title={`Заявок: ${community.requestsCount}`} /> : null}
              {mention ? <span className={styles.mention}>@</span> : null}
              {total ? <span className={unread ? styles.unread : `${styles.unread} ${styles.mutedBadge}`}>{total > 99 ? "99+" : String(total)}</span> : null}
            </span>
          </span>
        </span>
      </button>
      <button type="button" className={styles.more} title="Действия с сообществом" aria-label="Действия с сообществом" onClick={openMenu}>
        <Icon name="MoreVertical" size={18} />
      </button>
      {menuAt ? <Menu at={menuAt} label="Сообщество" items={menu.items} onClose={() => setMenuAt(null)} /> : null}
      {menu.dialogs(meId)}
    </div>
  );
}

type PanelProps = {
  community: JoinedCommunity;
  chats: readonly ChatSummary[];
  meId: string;
  /** Обычная строка чата из списка (со всеми её действиями). */
  renderChat: (chat: ChatSummary) => ReactNode;
};

/** Панель сообщества в колонке списка чатов — renderCommunityPanel в communityList.js. */
export function CommunityPanel({ community: base, chats, meId, renderChat }: PanelProps) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const actions = useCommunityActions();
  const detail = useQuery(communityQueries.detail(base.id));
  const info = detail.data;
  const community = info ? { ...base, ...info } : { ...base, description: base.description, requestsCount: base.requestsCount };
  const [menuAt, setMenuAt] = useState<Point | null>(null);
  const [adding, setAdding] = useState(false);
  const [requests, setRequests] = useState(false);
  const [settings, setSettings] = useState(false);
  const menu = useCommunityMenu(community, chats, { inPanel: true });
  const mine = sortChats(memberChatsOf(base, chats));
  const others = (info?.chats ?? []).filter((c) => !c.isMember);
  const open = others.filter((c) => c.isPublic && !c.approveJoins && c.visible !== false);
  const requestable = others.filter((c) => c.isPublic && c.approveJoins && c.visible !== false);
  const hidden = others.filter((c) => c.visible === false);
  const inviteOnly = others.filter((c) => !c.isPublic && c.visible !== false);
  const count = info?.chats.length ?? base.chatIds.length;
  const reload = () => void client.invalidateQueries({ queryKey: communityQueries.detail(base.id).queryKey });

  const join = async (c: CommunityChat) => {
    try {
      const res = await communityApi.joinChat(c.id);
      if ("pending" in res && res.pending) toast(c.type === "channel" ? "Заявка на вступление в канал отправлена его администраторам" : "Заявка на вступление в группу отправлена её администраторам");
      await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      reload();
      await actions.refresh(base.id);
      if (!("pending" in res && res.pending)) void navigate(`/chat/${c.id}`);
    } catch (err) {
      toast(errorText(err, "Не удалось вступить"), { error: true });
    }
  };

  const otherRow = (c: CommunityChat) => (
    <div key={c.id} className={styles.otherChat}>
      <Avatar size={54} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
      <span className={styles.body}>
        <span className={styles.line}>
          <span className={styles.title}>{c.title}</span>
          {c.visible === false ? (
            <span title="Скрытый чат">
              <Icon name="EyeOff" size={13} />
            </span>
          ) : null}
        </span>
        <span className={styles.preview}>{`${c.username ? `@${c.username} · ` : ""}${chatMembersLabel(c)}`}</span>
      </span>
      {c.isPublic ? (
        <JoinButton label={c.approveJoins ? "Подать заявку" : c.type === "channel" ? "Подписаться" : "Вступить"} onJoin={() => join(c)} />
      ) : (
        <span className={styles.inviteOnly} title="Вступить можно только по приглашению">
          <Icon name="Lock" size={13} /> по приглашению
        </span>
      )}
    </div>
  );
  const section = (label: string, nodes: ReactNode[]) =>
    nodes.length ? (
      <div key={label}>
        <p className={styles.sectionLabel}>{label}</p>
        {nodes}
      </div>
    ) : null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <button type="button" className={styles.iconButton} title="Назад к чатам" aria-label="Назад к чатам" onClick={() => setCommunityPanel(null)}>
          <Icon name="ChevronLeft" size={22} />
        </button>
        <button type="button" className={styles.info} title="О сообществе" onClick={() => setSettings(true)}>
          <CommunityAvatar community={community} size={40} />
          <span className={styles.titles}>
            <span className={styles.title}>{community.title}</span>
            <span className={styles.subtitle}>
              {chatsCountLabel(count)}
              {info?.membersCount ? ` · ${communityMembersLabel(info.membersCount)}` : ""}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          title="Ещё"
          aria-label="Ещё"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: r.right - 8, y: r.bottom + 2 });
          }}
        >
          <Icon name="MoreVertical" size={20} />
        </button>
      </div>
      <div className={styles.scroll}>
        {detail.isError ? (
          <div className={styles.error}>
            <p className={styles.empty}>Не удалось загрузить сообщество</p>
            <button type="button" className={styles.joinButton} onClick={reload}>
              Повторить
            </button>
          </div>
        ) : null}
        {community.description ? <p className={styles.description}>{community.description}</p> : null}
        {community.requestsCount && info ? (
          <button type="button" className={styles.requestsBanner} onClick={() => setRequests(true)}>
            <Icon name="Inbox" size={18} />
            <span>{`${community.requestsCount} ${plural(community.requestsCount, "заявка", "заявки", "заявок")} на добавление чата`}</span>
            <Icon name="ChevronRight" size={16} />
          </button>
        ) : null}
        {info?.addPolicy ? (
          <button type="button" className={styles.addChat} onClick={() => setAdding(true)}>
            <span className={styles.addChatIcon}>
              <Icon name="Plus" size={22} />
            </span>
            <span>{info.addPolicy === "suggest" ? "Предложить свой чат" : "Добавить чат в сообщество"}</span>
          </button>
        ) : null}
        {section(
          "Ваши чаты",
          mine.map((c) => <div key={c.id}>{renderChat(c)}</div>)
        )}
        {section("Можно вступить", open.map(otherRow))}
        {section("Вступление по заявке", requestable.map(otherRow))}
        {section("По приглашению", inviteOnly.map(otherRow))}
        {section("Скрытые чаты", hidden.map(otherRow))}
        {!mine.length && !others.length ? (
          <p className={styles.empty}>{!info ? "Загрузка…" : info.addPolicy ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов"}</p>
        ) : null}
      </div>
      {menuAt ? <Menu at={menuAt} label="Сообщество" items={menu.items} onClose={() => setMenuAt(null)} /> : null}
      {menu.dialogs(meId)}
      {adding && info ? <AddChatFlow community={info} meId={meId} onClose={() => setAdding(false)} onDone={reload} /> : null}
      {requests && info ? <RequestsDialog community={info} onChanged={reload} onClose={() => setRequests(false)} /> : null}
      {settings ? <CommunitySettingsDialog communityId={base.id} meId={meId} onSaved={reload} onClose={() => setSettings(false)} /> : null}
    </div>
  );
}

function JoinButton({ label, onJoin }: { label: string; onJoin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.joinButton}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void onJoin().finally(() => setBusy(false));
      }}
    >
      {label}
    </button>
  );
}
