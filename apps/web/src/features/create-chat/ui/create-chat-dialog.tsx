import { useRef, useState } from "react";

import type { Contact } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { plural } from "@/shared/lib/presence";
import { Avatar, Button, Dialog, Icon, TextField, toast } from "@/shared/ui";

import type { NewChatFields } from "../api/create-chat";

import styles from "./create-chat.module.css";

type Props = {
  kind: "group" | "channel";
  members: readonly Contact[];
  onSubmit: (fields: Omit<NewChatFields, "memberIds" | "adminIds">) => Promise<void>;
  onClose: () => void;
};

/** «Новая группа» / «Новый канал» — фото, название, описание, тип и ссылка (createChatDialog.js). */
export function CreateChatDialog({ kind, members, onSubmit, onClose }: Props) {
  const isChannel = kind === "channel";
  const what = isChannel ? "канала" : "группы";
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<"title" | "username" | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatarImage(await fileToImageDataUrl(file, 512));
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };
  const submit = async () => {
    const t = title.trim();
    if (!t) return setError("title");
    if (isPublic && username.trim().length < 3) {
      setError("username");
      toast("Для публичного нужна ссылка — от 3 символов");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ title: t, avatarImage, description: description.trim(), isPublic, username: isPublic ? username.trim() : null });
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не получилось"), { error: true });
    }
  };

  return (
    <Dialog title={isChannel ? "Новый канал" : "Новая группа"} onClose={onClose}>
      <button type="button" className={styles.avatarEdit} title="Выбрать фото" onClick={() => fileInput.current?.click()}>
        <Avatar size={96} name={title || "?"} image={avatarImage} />
        <span className={styles.avatarIcon}>
          <Icon name="Camera" size={30} />
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Фото"
        onChange={(e) => {
          void pickAvatar(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <label className={styles.field}>
        <span>Название {what}</span>
        <TextField
          value={title}
          maxLength={128}
          autoFocus
          aria-invalid={error === "title" || undefined}
          className={error === "title" ? styles.invalid : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
      </label>
      <label className={styles.field}>
        <span>Описание (необязательно)</span>
        <textarea className={styles.textarea} rows={2} maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <p className={styles.sectionName}>{isChannel ? "Тип канала" : "Тип группы"}</p>
      <div role="radiogroup" aria-label={isChannel ? "Тип канала" : "Тип группы"}>
        {[
          { pub: false, title: isChannel ? "Частный канал" : "Частная группа", sub: "Вступить можно по пригласительной ссылке" },
          { pub: true, title: isChannel ? "Публичный канал" : "Публичная группа", sub: "Найдут в поиске и откроют по ссылке" },
        ].map((o) => (
          <button key={String(o.pub)} type="button" role="radio" aria-checked={isPublic === o.pub} className={styles.radioRow} onClick={() => setIsPublic(o.pub)}>
            <span className={isPublic === o.pub ? `${styles.radio} ${styles.radioOn}` : styles.radio} />
            <span className={styles.personText}>
              <span>{o.title}</span>
              <span className={styles.hint}>{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.hint}>{isPublic ? `Любой сможет найти ${isChannel ? "канал" : "группу"} и открыть по ссылке.` : "Пригласительная ссылка появится сразу после создания."}</p>
      {isPublic ? (
        <label className={styles.field}>
          <span>Юзернейм</span>
          <TextField
            value={username}
            className={error === "username" ? `${styles.mono} ${styles.invalid}` : styles.mono}
            aria-invalid={error === "username" || undefined}
            onChange={(e) => {
              setUsername(e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, ""));
              setError(null);
            }}
          />
          <span className={styles.hint}>Можно использовать латиницу, цифры и подчёркивание. Минимум 3 символа.</span>
        </label>
      ) : null}
      {members.length ? (
        <>
          <p className={styles.sectionName}>
            {members.length} {plural(members.length, isChannel ? "подписчик" : "участник", isChannel ? "подписчика" : "участника", isChannel ? "подписчиков" : "участников")}
          </p>
          <div className={styles.memberList}>
            {members.map((u) => (
              <div key={u.id} className={styles.memberRow}>
                <Avatar size={32} name={u.name} color={u.avatarColor} image={u.avatarImage} />
                <span>{u.name}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          {/* «Далее» и у группы — кнопка-стрелка в createChatDialog.js. */}
          Далее
        </Button>
      </div>
    </Dialog>
  );
}
