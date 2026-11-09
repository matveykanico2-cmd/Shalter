import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { AddChatFlow, CommunitySettingsDialog, useCommunityActions } from "@/features/community-editor";
import { createChannel, CreateChatDialog, createGroup } from "@/features/create-chat";
import { fileSizeLabel } from "@/features/send-message";

import { chatQueries } from "@/entities/chat";
import { chatMembersLabel, chatsCountLabel, type Community, communityApi, CommunityAvatar, type CommunityChat, communityMembersLabel, communityQueries, useOpenCommunity } from "@/entities/community";
import { type Attachment, mediaItem } from "@/entities/message";
import { useSession } from "@/entities/session";
import { openUserProfile } from "@/entities/user";

import { useWsEvent } from "@/shared/api";
import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Avatar, Button, Icon, MediaViewer, toast, type ViewerItem } from "@/shared/ui";

import styles from "./community-view.module.css";

/**
 * Страница сообщества по ссылке /community/:id — public/js/views/community.js (tweb: профиль
 * сообщества): вступить в сообщество и в его открытые чаты, подать заявку, перейти в панель.
 */
export function CommunityView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const detail = useQuery(communityQueries.detail(id));
  // Пока страница открыта — подхватываем изменения от других участников.
  useWsEvent("community:updated", ({ communityId }) => {
    if (communityId === id) void client.invalidateQueries({ queryKey: communityQueries.detail(id).queryKey });
  });

  if (detail.isError || !detail.data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{detail.isError ? "Сообщество недоступно" : "Загрузка…"}</h1>
        {detail.isError ? (
          <>
            <p className={styles.hint}>{errorText(detail.error, "Сообщество не найдено")}</p>
            <Button onClick={() => void navigate("/")}>К чатам</Button>
          </>
        ) : null}
      </div>
    );
  }
  return <CommunityPage key={id} community={detail.data} />;
}

function CommunityPage({ community }: { community: Community }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useSession().data?.user;
  const actions = useCommunityActions();
  const openCommunity = useOpenCommunity();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"add" | "settings" | null>(null);
  const [tab, setTab] = useState<"chats" | "members" | "media" | "files" | "links">("chats");
  const [creating, setCreating] = useState<"group" | "channel" | null>(null);
  const rights = community.rights;
  const reload = () => void client.invalidateQueries({ queryKey: communityQueries.detail(community.id).queryKey });

  const joinChat = async (chat: CommunityChat) => {
    setBusy(chat.id);
    try {
      const res = await communityApi.joinChat(chat.id);
      if ("pending" in res) {
        toast(chat.type === "channel" ? "Заявка на вступление в канал отправлена" : "Заявка на вступление в группу отправлена");
      } else {
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
        await actions.refresh(community.id);
        void navigate(`/chat/${chat.id}`);
        return;
      }
    } catch (err) {
      toast(errorText(err, "Не удалось вступить"), { error: true });
    }
    setBusy(null);
    reload();
  };

  const joinCommunity = async () => {
    setBusy("community");
    try {
      const res = await communityApi.join(community.id);
      client.setQueryData(communityQueries.detail(community.id).queryKey, res.community);
      await actions.refresh();
      toast("Вы вступили в сообщество");
    } catch (err) {
      toast(errorText(err, "Не удалось вступить"), { error: true });
    }
    setBusy(null);
  };

  const chatAction = (c: CommunityChat) =>
    c.isMember ? (
      <Button variant="secondary" onClick={() => void navigate(`/chat/${c.id}`)}>
        Открыть
      </Button>
    ) : c.isPublic ? (
      <Button disabled={busy === c.id} onClick={() => void joinChat(c)}>
        {busy === c.id ? "…" : c.approveJoins ? "Подать заявку" : c.type === "channel" ? "Подписаться" : "Вступить"}
      </Button>
    ) : (
      <span className={styles.inviteOnly}>
        <Icon name="Lock" size={13} /> по приглашению
      </span>
    );

  return (
    <div className={styles.page}>
      <CommunityAvatar community={community} size={88} />
      <h1 className={styles.title}>{community.title}</h1>
      <p className={styles.hint}>
        {community.membersCount == null
          ? "Закрытое сообщество — вступить можно по приглашению в один из его чатов"
          : `Сообщество · ${chatsCountLabel(community.chats.length)} · ${communityMembersLabel(community.membersCount)}`}
      </p>
      {community.description ? <p className={styles.description}>{community.description}</p> : null}
      <div className={styles.tools}>
        {community.isMember ? (
          <Button onClick={() => void openCommunity(community.id)}>Открыть в списке чатов</Button>
        ) : community.membersCount == null ? null : (
          <Button disabled={busy === "community"} onClick={() => void joinCommunity()}>
            Вступить в сообщество
          </Button>
        )}
        {community.isMember ? (
          <Button variant="secondary" onClick={() => setTab("members")}>
            <Icon name="Users" size={15} /> Участники
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => void copyText(publicUrl(`/community/${community.id}`), "Ссылка на сообщество скопирована")}>
          <Icon name="Link" size={15} /> Ссылка
        </Button>
        {community.addPolicy ? (
          <Button variant="secondary" onClick={() => setDialog("add")}>
            <Icon name="Plus" size={15} /> {community.addPolicy === "suggest" ? "Предложить чат" : "Добавить чат"}
          </Button>
        ) : null}
        {community.isMember && (community.rights?.editChats || community.isOwner) ? (
          <>
            <Button variant="secondary" onClick={() => setCreating("group")}>
              <Icon name="Users" size={15} /> Создать группу
            </Button>
            <Button variant="secondary" onClick={() => setCreating("channel")}>
              <Icon name="Send" size={15} /> Создать канал
            </Button>
          </>
        ) : null}
        {community.isMember ? (
          <Button variant="secondary" onClick={() => setDialog("settings")}>
            <Icon name={rights.editInfo || rights.editChats ? "Edit" : "Users"} size={15} /> {rights.editInfo || rights.editChats ? "Управление" : "Подробнее"}
          </Button>
        ) : null}
        {community.isMember && !community.isOwner ? (
          <Button variant="danger" onClick={() => void actions.leave(community).then((ok) => ok && reload())}>
            <Icon name="LogOut" size={15} /> Покинуть
          </Button>
        ) : null}
      </div>
      {community.isMember ? (
        <div className={styles.tabs} role="tablist" aria-label="Разделы сообщества">
          {([
            ["chats", "Чаты"],
            ["members", "Участники"],
            ["media", "Медиа"],
            ["files", "Файлы"],
            ["links", "Ссылки"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? `${styles.tab} ${styles.tabActive}` : styles.tab} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "chats" && community.chats.length ? (
        <div className={styles.chats}>
          {community.chats.map((c) => (
            <div key={c.id} className={styles.chat}>
              <Avatar size={40} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} emoji={c.avatarEmoji} />
              <div className={styles.chatBody}>
                <p className={styles.chatTitle}>
                  {c.type === "channel" ? "📢 " : null}
                  <span>{c.title}</span>
                  {c.visible === false ? (
                    <span title="Скрытый чат">
                      <Icon name="EyeOff" size={13} />
                    </span>
                  ) : null}
                </p>
                <p className={styles.hint}>{`${chatMembersLabel(c)}${c.username ? ` · @${c.username}` : ""}`}</p>
              </div>
              {chatAction(c)}
            </div>
          ))}
        </div>
      ) : tab === "chats" ? (
        <>
          <p className={styles.hint}>{community.addPolicy ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов"}</p>
          <Button variant="link" onClick={() => void navigate("/")}>
            К чатам
          </Button>
          {dialog === "add" && me ? <AddChatFlow community={community} meId={me.id} onDone={reload} onClose={() => setDialog(null)} /> : null}
        </>
      ) : community.isMember ? (
        <CommunityProfileTab community={community} tab={tab} />
      ) : null}
      {creating && me ? (
        <CreateChatDialog
          kind={creating}
          members={[]}
          onClose={() => setCreating(null)}
          onSubmit={async (fields) => {
            const created =
              creating === "channel"
                ? await createChannel({ ...fields, memberIds: [], adminIds: [] })
                : await createGroup({ ...fields, memberIds: [], adminIds: [] });
            await communityApi.addChat(community.id, created.chat.id, true);
            await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
            reload();
            setCreating(null);
            void navigate(`/chat/${created.chat.id}`);
          }}
        />
      ) : null}
      {dialog === "settings" && me ? <CommunitySettingsDialog communityId={community.id} meId={me.id} onSaved={reload} onDeleted={() => void navigate("/")} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

const roleIcon = (role: string) => (role === "owner" ? "Crown" : role === "admin" ? "Shield" : null);

/** Вкладки профиля сообщества по образцу профиля группы: участники, медиа, файлы, ссылки. */
function CommunityProfileTab({ community, tab }: { community: Community; tab: "members" | "media" | "files" | "links" }) {
  const [query, setQuery] = useState("");
  const members = useQuery({
    queryKey: ["communities", "members", community.id, query],
    queryFn: () => communityApi.members(community.id, query).then((r) => r.users),
    enabled: tab === "members",
    staleTime: 0,
  });
  const shared = useQuery({ ...communityQueries.media(community.id), enabled: tab !== "members" });
  if (tab !== "members") {
    return (
      <CommunitySharedTab
        tab={tab}
        data={shared.data}
        pending={shared.isPending}
        error={shared.isError ? errorText(shared.error, "Не удалось загрузить раздел") : null}
      />
    );
  }
  const list = members.data ?? [];
  return (
    <section className={styles.profileTab} aria-label="Участники сообщества">
      <input
        className={styles.search}
        placeholder="Поиск участников"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={styles.list}>
        {members.isError ? (
          <p className={styles.caption} role="alert">
            {errorText(members.error, "Не удалось загрузить участников")}
          </p>
        ) : members.isPending ? (
          <p className={styles.caption}>Загрузка…</p>
        ) : list.length ? (
          list.map((m) => (
            <button key={m.id} type="button" className={styles.memberRow} onClick={() => void openUserProfile(m.id)}>
              <Avatar size={40} name={m.name} color={m.avatarColor} image={m.avatarImage} emoji={m.avatarEmoji} online={m.online} />
              <span className={styles.memberBody}>
                <span className={styles.memberName}>{m.name}</span>
                {m.username ? <span className={styles.memberUsername}>@{m.username}</span> : null}
                {m.role && m.role !== "member" ? (
                  <span className={`${styles.memberRole} ${styles[roleIcon(m.role) === "Crown" ? "roleOwner" : "roleAdmin"]}`} title={m.role === "owner" ? "Владелец" : "Администратор"}>
                    <Icon name={roleIcon(m.role) ?? "User"} size={13} /> {m.role === "owner" ? "Владелец" : "Администратор"}
                  </span>
                ) : null}
              </span>
            </button>
          ))
        ) : (
          <p className={styles.caption}>{query ? "Никого не нашлось" : "Участников нет"}</p>
        )}
      </div>
    </section>
  );
}

function CommunitySharedTab({
  tab,
  data,
  pending,
  error,
}: {
  tab: "media" | "files" | "links";
  data: Awaited<ReturnType<typeof communityApi.media>> | undefined;
  pending: boolean;
  error: string | null;
}) {
  if (error)
    return (
      <p className={styles.caption} role="alert">
        {error}
      </p>
    );
  if (tab === "media") {
    const items = data?.media ?? [];
    return items.length ? <CommunityMediaGrid items={items} /> : <p className={styles.caption}>{pending ? "Загрузка…" : "Медиа пока нет"}</p>;
  }
  if (tab === "files") {
    const items = data?.files ?? [];
    if (!items.length) return <p className={styles.caption}>{pending ? "Загрузка…" : "Файлов пока нет"}</p>;
    return <CommunityFilesList items={items} />;
  }
  const links = data?.links ?? [];
  if (!links.length) return <p className={styles.caption}>{pending ? "Загрузка…" : "Ссылок пока нет"}</p>;
  return <CommunityLinksList items={links} />;
}

const MEDIA_PAGE = 30;
const LIST_PAGE = 50;

function CommunityFilesList({ items }: { items: NonNullable<Awaited<ReturnType<typeof communityApi.media>>>["files"] }) {
  const [shown, setShown] = useState(LIST_PAGE);
  return (
    <>
      <div className={styles.filesList}>
        {items.slice(0, shown).map((item) => {
          const file = item.attachment as Attachment;
          return (
            <a key={`${item.messageId}:${file.url}`} className={styles.fileRow} href={file.url} target="_blank" rel="noreferrer" download={file.name ?? true}>
              <span className={styles.fileIcon}><Icon name="File" size={22} /></span>
              <span className={styles.fileBody}>
                <strong>{file.name || "Файл"}</strong>
                <small>{[file.size ? fileSizeLabel(file.size) : "", mediaDate(item.createdAt)].filter(Boolean).join(" · ")}</small>
              </span>
              <Icon name="Download" size={18} />
            </a>
          );
        })}
      </div>
      {shown < items.length ? <MoreButton onClick={() => setShown((value) => value + LIST_PAGE)} /> : null}
    </>
  );
}

function CommunityLinksList({ items }: { items: NonNullable<Awaited<ReturnType<typeof communityApi.media>>>["links"] }) {
  const [shown, setShown] = useState(LIST_PAGE);
  return (
    <>
      <div className={styles.linksList}>
        {items.slice(0, shown).map((item) => {
          const preview = item.linkPreview as { url?: string; title?: string; description?: string } | undefined;
          const url = preview?.url ?? item.text.match(/https?:\/\/\S+/)?.[0];
          return url ? (
            <a key={item.messageId} className={styles.linkRow} href={url} target="_blank" rel="noreferrer">
              <span className={styles.linkIcon}>{(preview?.title ?? url).slice(0, 1).toUpperCase()}</span>
              <span className={styles.fileBody}>
                <strong>{preview?.title || url}</strong>
                {preview?.description ? <small>{preview.description}</small> : null}
                <small className={styles.linkUrl}>{url}</small>
              </span>
            </a>
          ) : null;
        })}
      </div>
      {shown < items.length ? <MoreButton onClick={() => setShown((value) => value + LIST_PAGE)} /> : null}
    </>
  );
}

function CommunityMediaGrid({ items }: { items: NonNullable<Awaited<ReturnType<typeof communityApi.media>>>["media"] }) {
  const [shown, setShown] = useState(MEDIA_PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const viewer: ViewerItem[] = items.map((item) => mediaItem(item.attachment as Attachment, { id: item.messageId }));
  return (
    <>
      <div className={styles.mediaGrid}>
        {viewer.slice(0, shown).map((item, index) => (
          <button key={`${items[index]?.messageId}:${index}`} type="button" className={styles.mediaCell} aria-label={item.kind === "video" ? "Видео" : "Фото"} onClick={() => setOpen(index)}>
            {item.kind === "video" && !item.thumbUrl ? <video src={item.url} muted preload="metadata" /> : <img src={item.thumbUrl ?? item.url} alt="" loading="lazy" />}
            {item.kind === "video" ? <span className={styles.play}><Icon name="Play" size={14} /></span> : null}
          </button>
        ))}
        {open !== null ? <MediaViewer items={viewer} index={open} onClose={() => setOpen(null)} /> : null}
      </div>
      {shown < items.length ? <MoreButton onClick={() => setShown((value) => value + MEDIA_PAGE)} /> : null}
    </>
  );
}

function MoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.moreButton} onClick={onClick}>
      Показать ещё
    </button>
  );
}

function mediaDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" });
}
