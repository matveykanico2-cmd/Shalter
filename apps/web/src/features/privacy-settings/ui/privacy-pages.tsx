import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { sessionQueries } from "@/entities/session";
import { type Settings, useUpdateSettings } from "@/entities/settings";

import { errorText } from "@/shared/lib/error-text";
import { passkeyErrorText } from "@/shared/lib/passkey";
import { askConfirm, Avatar, Icon, SettingsButton, SettingsRow, SettingsSection, toast } from "@/shared/ui";

import { addPasskey, type BlockedUser, deletePasskey, type Passkey, privacyQueries, unblockUser } from "../api/privacy-settings";
import { LEVELS, type PrivacyRule } from "../config/privacy-rules";

import { type Exceptions, ExceptionsDialog } from "./exceptions-dialog";
import styles from "./privacy.module.css";

/** Подстраница правила: кто может — и исключения (renderRule). */
export function RulePage({ rule, settings }: { rule: PrivacyRule; settings: Settings }) {
  const update = useUpdateSettings();
  const [editing, setEditing] = useState<"allow" | "deny" | null>(null);
  const value = settings.privacy[rule.key] ?? "everyone";
  const exc = settings.privacy.exceptions?.[rule.key];
  const allow = exc?.allow.length ?? 0;
  const deny = exc?.deny.length ?? 0;
  // Сервер сливает настройки по верхнему уровню — privacy уходит целиком.
  const patch = (privacy: Partial<Settings["privacy"]>) => update.mutate({ privacy: { ...settings.privacy, ...privacy } });
  const saveExceptions = (next: Exceptions) => patch({ exceptions: { ...(settings.privacy.exceptions ?? {}), [rule.key]: next } });

  return (
    <>
      <SettingsSection title={rule.who} caption="Можно добавить пользователей в исключения — они будут видеть или не видеть это вне зависимости от выбора.">
        {LEVELS.map((o) => (
          <button key={o.value} type="button" className={styles.radioRow} aria-pressed={value === o.value} onClick={() => patch({ [rule.key]: o.value })}>
            <span className={styles.radio} />
            <span>{o.label}</span>
          </button>
        ))}
      </SettingsSection>
      <SettingsSection title="Исключения" caption="Исключения переопределяют настройку выше.">
        {value !== "everyone" ? (
          <SettingsRow
            icon="Plus"
            color="green"
            title="Всегда разрешать"
            titleRight={allow ? String(allow) : null}
            subtitle={allow ? null : "Добавить пользователей"}
            onClick={() => setEditing("allow")}
          />
        ) : null}
        {value !== "nobody" ? (
          <SettingsRow
            icon="X"
            color="red"
            title="Никогда не разрешать"
            titleRight={deny ? String(deny) : null}
            subtitle={deny ? null : "Добавить пользователей"}
            onClick={() => setEditing("deny")}
          />
        ) : null}
      </SettingsSection>
      {editing ? (
        <ExceptionsDialog
          title={editing === "allow" ? "Всегда разрешать" : "Никогда не разрешать"}
          value={exc}
          onSave={saveExceptions}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** «Заблокированные» (renderBlocked). */
export function BlockedPage({ users }: { users: BlockedUser[] }) {
  const client = useQueryClient();
  const unblock = useMutation({
    mutationFn: (userId: string) => unblockUser(userId),
    onSuccess: (_res, userId) =>
      client.setQueryData(sessionQueries.current().queryKey, (s) =>
        s?.user ? { ...s, user: { ...s.user, blockedUserIds: s.user.blockedUserIds.filter((id) => id !== userId) } } : s
      ),
    onError: (err) => toast(errorText(err, "Не удалось разблокировать"), { error: true }),
  });
  return (
    <SettingsSection caption="Заблокированные пользователи не могут писать вам, звонить и добавлять вас в группы.">
      {users.length ? (
        users.map((u) => (
          <div key={u.id} className={styles.userRow}>
            <Avatar name={u.name} color={u.avatarColor} image={u.avatarImage} size={42} />
            <span className={styles.userBody}>
              <span className={styles.userName}>{u.name}</span>
              {u.username ? <span className={styles.muted}>@{u.username}</span> : null}
            </span>
            <button type="button" className={styles.linkButton} onClick={() => unblock.mutate(u.id)}>
              Разблокировать
            </button>
          </div>
        ))
      ) : (
        <p className={styles.empty}>Никого не заблокировано</p>
      )}
    </SettingsSection>
  );
}

const ruDate = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");

/** «Ключи доступа» (renderPasskeys). */
export function PasskeysPage({ passkeys }: { passkeys: Passkey[] }) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const refetch = () => client.invalidateQueries({ queryKey: privacyQueries.passkeys().queryKey });

  const add = async () => {
    setNotice(null);
    try {
      await addPasskey();
      await refetch();
      setNotice("Ключ доступа добавлен — теперь можно входить без пароля и кода");
    } catch (err) {
      setNotice(passkeyErrorText(err));
    }
  };
  const remove = async (p: Passkey) => {
    if (!(await askConfirm(`Удалить ключ «${p.name}»? Войти с ним больше не получится.`))) return;
    try {
      await deletePasskey(p.id);
      client.setQueryData(privacyQueries.passkeys().queryKey, (list) => list?.filter((x) => x.id !== p.id));
    } catch (err) {
      toast(errorText(err, "Не удалось удалить ключ"), { error: true });
    }
  };

  return (
    <>
      <div className={styles.mediaHeader}>
        <Icon name="Key" size={56} />
        <p>Вход по отпечатку, лицу или PIN-коду устройства — без пароля и кода. Ключ нельзя украсть фишингом.</p>
      </div>
      <SettingsSection title="Ваши ключи" caption={notice}>
        {passkeys.map((p) => (
          <SettingsRow
            key={p.id}
            icon="Key"
            color="orange"
            title={p.name}
            subtitle={p.lastUsedAt ? `Последний вход: ${ruDate(p.lastUsedAt)}` : `Добавлен ${ruDate(p.createdAt)}`}
            right={
              <button type="button" className={`${styles.iconButton} ${styles.iconDanger}`} title="Удалить" aria-label="Удалить" onClick={() => void remove(p)}>
                <Icon name="Trash" size={20} />
              </button>
            }
          />
        ))}
        <SettingsButton icon="Plus" onClick={() => void add()}>
          Создать ключ доступа
        </SettingsButton>
      </SettingsSection>
    </>
  );
}
