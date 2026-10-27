import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { type ChatSummary, isChatAdmin, useChats } from "@/entities/chat";
import { type Community, communityApi, type CommunityChat, communityQueries } from "@/entities/community";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Dialog, toast } from "@/shared/ui";

import { VISIBLE_OPTIONS } from "../lib/options";
import { useCommunityActions } from "../model/use-community-actions";

import styles from "./community-editor.module.css";
import { ChatLine, Empty, RadioRows } from "./parts";

type Props = { community: Community; meId: string; onClose: () => void; onDone?: () => void };

/** «Добавить чат»: свой чат, затем его видимость — openAddChatFlow в communityEditor.js. */
export function AddChatFlow({ community, meId, onClose, onDone }: Props) {
  const [picked, setPicked] = useState<ChatSummary | null>(null);
  if (!picked) return <OwnChatPicker community={community} meId={meId} onPick={setPicked} onClose={onClose} />;
  const card = {
    id: picked.id,
    type: picked.type === "channel" ? ("channel" as const) : ("group" as const),
    title: picked.title,
    avatarColor: picked.avatarColor ?? null,
    avatarImage: picked.avatarImage ?? null,
    username: picked.username ?? null,
    members: picked.membersCount,
    visible: true,
  };
  return <ChatSettingsDialog community={community} chat={card} mode="add" onClose={onClose} onSaved={onDone} />;
}

/** Свои группы и каналы (владелец или админ), ещё не входящие в сообщество, — openOwnChatPicker. */
function OwnChatPicker({ community, meId, onPick, onClose }: { community: Community; meId: string; onPick: (chat: ChatSummary) => void; onClose: () => void }) {
  const chats = useChats().data ?? [];
  const joined = useQuery(communityQueries.joined()).data ?? [];
  const taken = new Set([...joined.flatMap((c) => c.chatIds), ...community.chats.map((c) => c.id)]);
  const candidates = chats.filter((c) => (c.type === "group" || c.type === "channel") && !c.secret && !taken.has(c.id) && isChatAdmin(c, meId));
  return (
    <Dialog title="Добавить чат в сообщество" onClose={onClose}>
      {community.addPolicy === "suggest" ? <p className={styles.caption}>Чат появится в сообществе после одобрения администратором.</p> : null}
      {candidates.length ? (
        <div className={styles.list}>
          {candidates.map((c) => (
            <button key={c.id} type="button" className={styles.row} onClick={() => onPick(c)}>
              <Avatar size={36} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
              <span>{`${c.type === "channel" ? "📢 " : ""}${c.title ?? ""}`}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty>Нет групп и каналов, которые можно добавить: нужен чат, где вы владелец или администратор и который ещё не входит в сообщество.</Empty>
      )}
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}

type SettingsProps = {
  community: Community;
  chat: Pick<CommunityChat, "id" | "type" | "title" | "avatarColor" | "avatarImage" | "username" | "members" | "visible"> & { isChatAdmin?: boolean };
  mode?: "add" | "settings";
  onSaved?: () => void;
  onClose: () => void;
};

/**
 * Видимость чата в сообществе — openCommunityChatSettings: при добавлении — выбор перед
 * «Добавить», иначе видимость существующего чата и «Убрать из сообщества».
 */
export function ChatSettingsDialog({ community, chat, mode = "settings", onSaved, onClose }: SettingsProps) {
  const actions = useCommunityActions();
  const [visible, setVisible] = useState(chat.visible !== false);
  const [busy, setBusy] = useState(false);
  const canEdit = mode === "add" || community.rights.editChats;
  const canRemove = mode !== "add" && (community.rights.editChats || !!chat.isChatAdmin);

  const save = async () => {
    setBusy(true);
    if (mode === "add") {
      const res = await actions.addChat(community, chat, visible);
      setBusy(false);
      if (!res) return;
      onClose();
      onSaved?.();
      return;
    }
    try {
      await communityApi.setChatVisible(community.id, chat.id, visible);
      void actions.refresh(community.id);
      onClose();
      onSaved?.();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  return (
    <Dialog title={mode === "add" ? "Добавить в сообщество" : "Чат в сообществе"} onClose={onClose} className={styles.wide}>
      <ChatLine chat={chat} />
      <p className={styles.sectionName}>Видимость чата</p>
      <RadioRows label="Видимость чата" options={VISIBLE_OPTIONS} value={visible} onChange={setVisible} disabled={!canEdit} />
      {mode === "add" && community.addPolicy === "suggest" ? (
        <p className={styles.caption}>Если администратор сообщества одобрит заявку, участники этого чата смогут вступать в другие чаты сообщества.</p>
      ) : null}
      {canRemove ? (
        <Button
          variant="danger"
          onClick={() =>
            void actions.removeChat(community, chat).then((ok) => {
              if (!ok) return;
              onClose();
              onSaved?.();
            })
          }
        >
          {chat.type === "channel" ? "Убрать канал из сообщества" : "Убрать группу из сообщества"}
        </Button>
      ) : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        {canEdit ? (
          <Button disabled={busy} onClick={() => void save()}>
            {mode === "add" ? "Добавить" : "Сохранить"}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
