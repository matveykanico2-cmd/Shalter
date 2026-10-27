import { switchAccount } from "@/features/accounts";
import { useSignOut } from "@/features/sign-out";

import { useSession } from "@/entities/session";

import { Avatar, Icon, SettingsButton, SettingsPage, SettingsSection } from "@/shared/ui";

import accountStyles from "./accounts-section.module.css";
import styles from "./sections.module.css";

/** «Аккаунты» — renderAccounts: аккаунты устройства, переключение, добавление, выход. */
export function AccountsSection() {
  const session = useSession().data;
  const me = session?.user;
  const { signOut, signOutAll, pending } = useSignOut(me?.id ?? "");
  if (!me) return null;
  const accounts = session.accounts;

  return (
    <SettingsPage>
      <SettingsSection title="Аккаунты на этом устройстве" caption="Можно держать несколько аккаунтов открытыми и переключаться между ними.">
        {accounts.map((a) => (
          <div key={a.id} className={accountStyles.row}>
            <button type="button" className={accountStyles.main} onClick={() => (a.id === me.id ? undefined : void switchAccount(a.id, { to: "/" }))}>
              <Avatar name={a.name || a.phone || "?"} color={a.avatarColor} image={a.avatarImage} size={42} />
              <span className={accountStyles.body}>
                <span className={accountStyles.title}>{a.name || a.phone || a.email}</span>
                <span className={accountStyles.subtitle}>{a.id === me.id ? "текущий аккаунт" : a.phone || a.email}</span>
              </span>
              {a.id === me.id ? (
                <span className={accountStyles.check}>
                  <Icon name="Check" size={20} />
                </span>
              ) : null}
            </button>
            <button type="button" className={styles.iconButton} title="Выйти из аккаунта" aria-label="Выйти из аккаунта" disabled={pending} onClick={() => void signOut(a.id)}>
              <Icon name="LogOut" size={20} />
            </button>
          </div>
        ))}
        <SettingsButton icon="Plus" onClick={() => (window.location.href = "/login?add=1")}>
          Добавить аккаунт
        </SettingsButton>
      </SettingsSection>
      <SettingsSection>
        <SettingsButton icon="LogOut" danger disabled={pending} onClick={() => void signOut(me.id)}>
          Выйти из текущего аккаунта
        </SettingsButton>
        {accounts.length > 1 ? (
          <SettingsButton icon="LogOut" danger disabled={pending} onClick={() => void signOutAll()}>
            Выйти из всех аккаунтов
          </SettingsButton>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}
