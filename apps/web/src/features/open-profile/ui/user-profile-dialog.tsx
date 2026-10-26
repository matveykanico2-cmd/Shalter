import { useQuery } from "@tanstack/react-query";

import { ProfileRows, userQueries } from "@/entities/user";

import { statusLabel } from "@/shared/lib/presence";
import { Avatar, Button, Dialog, EmojiText, Icon } from "@/shared/ui";

import { useOpenDm } from "../model/use-open-dm";

import styles from "./open-profile.module.css";

type Props = { userId: string; meId: string; onClose: () => void };

/** Профиль по @имени — главное из profileDialog.js: кто это и «Написать сообщение». */
export function UserProfileDialog({ userId, meId, onClose }: Props) {
  const profile = useQuery(userQueries.profile(userId));
  const openDm = useOpenDm();
  const u = profile.data?.user;
  const status = u ? statusLabel(u) : null;
  return (
    <Dialog title="Профиль" onClose={onClose} className={styles.profile}>
      {profile.isError ? <p className={styles.muted}>Не удалось загрузить профиль</p> : null}
      {!u && !profile.isError ? <p className={styles.muted}>Загрузка…</p> : null}
      {u ? (
        <>
          <div className={styles.hero}>
            <Avatar size={96} name={u.name} color={u.avatarColor} image={u.avatarImage} />
            <p className={styles.name}>
              <EmojiText text={[u.name, u.lastName].filter(Boolean).join(" ")} />
              {u.isVerified ? (
                <span className={styles.verified} title="Подтверждённый аккаунт">
                  <Icon name="Verified" size={16} />
                </span>
              ) : null}
            </p>
            <p className={status === "в сети" ? `${styles.muted} ${styles.online}` : styles.muted}>{status ?? "был(а) недавно"}</p>
          </div>
          <ProfileRows userId={userId} className={styles.rows} />
          {u.id !== meId ? (
            <Button
              onClick={() =>
                void openDm(u).then((ok) => {
                  if (ok) onClose();
                })
              }
            >
              {u.isBot ? "Открыть чат с ботом" : "Написать сообщение"}
            </Button>
          ) : null}
        </>
      ) : null}
      <Button variant="link" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}
