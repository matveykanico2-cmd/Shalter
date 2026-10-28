import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { chatQueries } from "@/entities/chat";
import { type AddMode, type Community, communityApi } from "@/entities/community";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, TextField, toast } from "@/shared/ui";

import { ADD_MODES, TITLE_MAX } from "../lib/options";
import { useCommunityActions } from "../model/use-community-actions";

import { AvatarEdit } from "./avatar-edit";
import styles from "./community-editor.module.css";
import { RadioRows } from "./parts";

type Props = { onCreated: (community: Community) => void; onClose: () => void };

/** «Новое сообщество» — openCreateCommunityDialog в communityEditor.js. */
export function CreateCommunityDialog({ onCreated, onClose }: Props) {
  const actions = useCommunityActions();
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addMode, setAddMode] = useState<AddMode>("all");
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  const chats = useQuery(chatQueries.list());
  const selectableChats = (chats.data ?? []).filter((c) => c.type === "group" || c.type === "channel");

  const create = async () => {
    const t = title.trim();
    if (!t) return setInvalid(true);
    setBusy(true);
    try {
      const { community } = await communityApi.create({
        title: t,
        description: description.trim(),
        avatarImage,
        addMode,
        chatId,
        chatVisible,
      });
      toast("Сообщество создано");
      await actions.refresh();
      onClose();
      onCreated(community);
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось создать сообщество"), { error: true });
    }
  };

  return (
    <Dialog title="Новое сообщество" onClose={onClose} className={styles.wide}>
      <AvatarEdit name={title} image={avatarImage} onChange={setAvatarImage} />
      <label className={styles.field}>
        <span>Название сообщества</span>
        <TextField
          value={title}
          maxLength={TITLE_MAX}
          autoFocus
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
        <textarea className={styles.textarea} rows={2} maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <p className={styles.caption}>Сообщество объединяет несколько групп и каналов под одной вывеской.</p>
      <p className={styles.sectionName}>Кто может добавлять чаты</p>
      <RadioRows label="Кто может добавлять чаты" options={ADD_MODES} value={addMode} onChange={setAddMode} />
      <p className={styles.sectionName}>Первый чат сообщества (группа или канал)</p>
      {selectableChats.length ? (
        <div className={styles.field}>
          <RadioRows label="Чат" options={selectableChats.map((c) => ({ value: c.id, title: c.title || "Без названия", sub: c.type === "channel" ? "Канал" : "Группа" }))} value={chatId ?? ""} onChange={(v) => setChatId(v || null)} />
          <label className={styles.caption}>
            <input type="checkbox" checked={chatVisible} onChange={(e) => setChatVisible(e.target.checked)} /> Виден всем участникам
          </label>
        </div>
      ) : (
        <p className={styles.caption}>У вас нет своих групп и каналов — добавьте их позже.</p>
      )}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={busy} onClick={() => void create()}>
          Создать
        </Button>
      </div>
    </Dialog>
  );
}
