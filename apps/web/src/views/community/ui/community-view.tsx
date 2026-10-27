import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { AddChatFlow, CommunitySettingsDialog, useCommunityActions } from "@/features/community-editor";

import { chatQueries } from "@/entities/chat";
import { chatMembersLabel, chatsCountLabel, type Community, communityApi, CommunityAvatar, type CommunityChat, communityMembersLabel, communityQueries, useOpenCommunity } from "@/entities/community";
import { useSession } from "@/entities/session";

import { useWsEvent } from "@/shared/api";
import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Avatar, Button, Icon, toast } from "@/shared/ui";

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
        <Button variant="secondary" onClick={() => void copyText(publicUrl(`/community/${community.id}`), "Ссылка на сообщество скопирована")}>
          <Icon name="Link" size={15} /> Ссылка
        </Button>
        {community.addPolicy ? (
          <Button variant="secondary" onClick={() => setDialog("add")}>
            <Icon name="Plus" size={15} /> {community.addPolicy === "suggest" ? "Предложить чат" : "Добавить чат"}
          </Button>
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
      {community.chats.length ? (
        <div className={styles.chats}>
          {community.chats.map((c) => (
            <div key={c.id} className={styles.chat}>
              <Avatar size={40} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
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
      ) : (
        <p className={styles.hint}>{community.addPolicy ? "Добавьте сюда свои группы и каналы" : "В сообществе пока нет чатов"}</p>
      )}
      <Button variant="link" onClick={() => void navigate("/")}>
        К чатам
      </Button>
      {dialog === "add" && me ? <AddChatFlow community={community} meId={me.id} onDone={reload} onClose={() => setDialog(null)} /> : null}
      {dialog === "settings" && me ? <CommunitySettingsDialog communityId={community.id} meId={me.id} onSaved={reload} onDeleted={() => void navigate("/")} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
