import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { type AddMode, chatsCountLabel, type Community, communityApi, type CommunityChat, communityQueries } from "@/entities/community";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Dialog, Icon, TextField, toast } from "@/shared/ui";

import { ADD_MODES, TITLE_MAX } from "../lib/options";
import { useCommunityActions } from "../model/use-community-actions";

import { AddChatFlow, ChatSettingsDialog } from "./add-chat-flow";
import { AvatarEdit } from "./avatar-edit";
import styles from "./community-editor.module.css";
import { AdminsDialog, BansDialog, RequestsDialog } from "./community-people";
import { ChatLine, Empty, RadioRows, Row } from "./parts";

type Screen = { kind: "main" } | { kind: "admins" } | { kind: "bans" } | { kind: "requests" } | { kind: "add" } | { kind: "chat"; chat: CommunityChat };

type Props = { communityId: string; meId: string; onClose: () => void; onSaved?: () => void; onDeleted?: () => void };

/**
 * «Изменить сообщество» / «Сообщество» — openEditCommunityDialog в communityEditor.js:
 * название, описание, фото, кто добавляет чаты, администраторы, заявки, удалённые, чаты.
 */
export function CommunitySettingsDialog({ communityId, meId, onClose, onSaved, onDeleted }: Props) {
  const detail = useQuery(communityQueries.detail(communityId));
  const [screen, setScreen] = useState<Screen>({ kind: "main" });
  const back = () => setScreen({ kind: "main" });
  const reload = () => {
    void detail.refetch();
    onSaved?.();
  };

  if (detail.isError) {
    return (
      <Dialog title="Сообщество" onClose={onClose}>
        <Empty>{errorText(detail.error, "Не удалось загрузить сообщество")}</Empty>
      </Dialog>
    );
  }
  const community = detail.data;
  if (!community) {
    return (
      <Dialog title="Сообщество" onClose={onClose}>
        <Empty>Загрузка…</Empty>
      </Dialog>
    );
  }
  switch (screen.kind) {
    case "admins":
      return <AdminsDialog community={community} meId={meId} onChanged={reload} onClose={back} />;
    case "bans":
      return <BansDialog community={community} meId={meId} onChanged={reload} onClose={back} />;
    case "requests":
      return <RequestsDialog community={community} onChanged={reload} onClose={back} />;
    case "add":
      return <AddChatFlow community={community} meId={meId} onDone={reload} onClose={back} />;
    case "chat":
      return <ChatSettingsDialog community={community} chat={screen.chat} onSaved={reload} onClose={back} />;
    default:
      return <MainScreen key={community.id} community={community} onOpen={setScreen} onClose={onClose} onSaved={reload} onDeleted={onDeleted} />;
  }
}

type MainProps = { community: Community; onOpen: (s: Screen) => void; onClose: () => void; onSaved: () => void; onDeleted?: () => void };

function MainScreen({ community, onOpen, onClose, onSaved, onDeleted }: MainProps) {
  const actions = useCommunityActions();
  const rights = community.rights;
  const saved = { title: community.title, description: community.description ?? "", addMode: community.addMode, avatarImage: community.avatarImage ?? null };
  const [title, setTitle] = useState(saved.title);
  const [description, setDescription] = useState(saved.description);
  const [addMode, setAddMode] = useState<AddMode>(saved.addMode);
  const [avatarImage, setAvatarImage] = useState<string | null>(saved.avatarImage);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  // tweb hasCommunityEditChanges: «Сохранить» — только когда что-то изменилось.
  const dirty =
    (rights.editInfo && (title.trim() !== saved.title || description.trim() !== saved.description || avatarImage !== saved.avatarImage)) || (rights.editChats && addMode !== saved.addMode);

  const save = async () => {
    const t = title.trim();
    if (!t) return setInvalid(true);
    setBusy(true);
    const patch: Parameters<typeof communityApi.update>[1] = {};
    if (rights.editInfo) Object.assign(patch, { title: t, description: description.trim(), avatarImage });
    if (rights.editChats) patch.addMode = addMode;
    try {
      await communityApi.update(community.id, patch);
      void actions.refresh(community.id);
      onSaved();
      onClose();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  const chats = community.chats;
  return (
    <Dialog title={rights.editInfo || rights.editChats ? "Изменить сообщество" : "Сообщество"} onClose={onClose} className={styles.wide}>
      {rights.editInfo ? (
        <AvatarEdit name={title} image={avatarImage} onChange={setAvatarImage} />
      ) : (
        <span className={styles.center}>
          <Avatar size={120} name={community.title} color={community.avatarColor} image={community.avatarImage} />
        </span>
      )}
      <label className={styles.field}>
        <span>Название сообщества</span>
        <TextField
          value={title}
          maxLength={TITLE_MAX}
          disabled={!rights.editInfo}
          aria-invalid={invalid || undefined}
          className={invalid ? styles.invalid : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setInvalid(false);
          }}
        />
      </label>
      <label className={styles.field}>
        <span>Описание (необязательно)</span>
        <textarea className={styles.textarea} rows={2} maxLength={255} value={description} disabled={!rights.editInfo} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {rights.editChats ? (
        <>
          <p className={styles.sectionName}>Кто может добавлять чаты</p>
          <RadioRows label="Кто может добавлять чаты" options={ADD_MODES} value={addMode} onChange={setAddMode} />
        </>
      ) : null}
      <div>
        <Row icon="Shield" title="Администраторы" right={community.adminsCount} onClick={() => onOpen({ kind: "admins" })} />
        {rights.editChats && community.requestsCount ? (
          <Row icon="Inbox" title="Заявки на добавление" right={community.requestsCount} accent onClick={() => onOpen({ kind: "requests" })} />
        ) : null}
        {rights.ban ? <Row icon="UserX" title="Удалённые пользователи" right={community.bannedCount} onClick={() => onOpen({ kind: "bans" })} /> : null}
        <Row icon="Users" title="Участники" right={community.membersCount} />
      </div>
      <p className={styles.sectionName}>{chatsCountLabel(chats.length)}</p>
      <div className={styles.list}>
        {community.addPolicy ? (
          <Row icon="Plus" title={community.addPolicy === "suggest" ? "Предложить чат" : "Добавить чат"} accent onClick={() => onOpen({ kind: "add" })} />
        ) : null}
        {chats.length ? (
          chats.map((chat) => (
            <ChatLine
              key={chat.id}
              chat={chat}
              onClick={() => onOpen({ kind: "chat", chat })}
              right={
                rights.editChats || chat.isChatAdmin ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Убрать из сообщества"
                    aria-label={`Убрать «${chat.title}» из сообщества`}
                    onClick={() => void actions.removeChat(community, chat).then((ok) => ok && onSaved())}
                  >
                    <Icon name="X" size={16} />
                  </button>
                ) : null
              }
            />
          ))
        ) : (
          <Empty>Добавьте группы и каналы — они появятся здесь.</Empty>
        )}
      </div>
      {community.isOwner ? (
        <Button
          variant="danger"
          onClick={() =>
            void actions.remove(community).then((ok) => {
              if (!ok) return;
              onClose();
              onDeleted?.();
            })
          }
        >
          Удалить сообщество
        </Button>
      ) : (
        <Button variant="danger" onClick={() => void actions.leave(community).then((ok) => ok && onClose())}>
          Покинуть сообщество
        </Button>
      )}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        {dirty ? (
          <Button disabled={busy} onClick={() => void save()}>
            Сохранить
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
