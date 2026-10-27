import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import type { SelfUser } from "@/entities/session";
import { useSession } from "@/entities/session";
import { starsQueries } from "@/entities/stars";
import { openUserProfile, ProfileStatusBadge } from "@/entities/user";

import { copyText } from "@/shared/lib/clipboard";
import { Avatar, Icon, MediaViewer, SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import { settingsViewQueries } from "../api/settings-api";
import { canSeeSection, SETTINGS_SECTIONS, type SettingsSectionEntry } from "../config/sections";

import styles from "./settings-menu.module.css";

/** Главная страница настроек — renderMenu: профиль, разделы группами, поддержка. */
export function SettingsMenu({ me, onSupport }: { me: SelfUser; onSupport: () => void }) {
  const navigate = useNavigate();
  const accounts = useSession().data?.accounts ?? [];
  const sessions = useQuery(settingsViewQueries.sessions()).data;
  // Баланс — при каждом открытии меню (покупки и переводы обновляют тот же ключ).
  const balance = useQuery({ ...starsQueries.info(), refetchOnMount: "always" }).data?.balance ?? 0;
  const [viewAvatar, setViewAvatar] = useState(false);

  const rightFor = (s: SettingsSectionEntry) => {
    if (s.id === "accounts" && accounts.length > 1) return String(accounts.length);
    if (s.id === "devices" && sessions?.length) return String(sessions.length);
    if (s.id === "stars" && balance > 0) return String(balance);
    return null;
  };
  const group = (g: SettingsSectionEntry["group"]) => SETTINGS_SECTIONS.filter((s) => s.group === g && canSeeSection(s, me));
  const rows = (list: SettingsSectionEntry[]) =>
    list.map((s) => <SettingsRow key={s.id} icon={s.icon} color={s.color} title={s.label} titleRight={rightFor(s)} href={`/settings/${s.id}`} />);
  const admin = group("admin");

  return (
    <SettingsPage>
      <div className={styles.hero}>
        <button
          type="button"
          className={styles.heroAvatar}
          aria-label="Фото профиля"
          onClick={() => (me.avatarImage ? setViewAvatar(true) : void navigate("/settings/profile"))}
        >
          <Avatar name={me.name || "?"} color={me.avatarColor} image={me.avatarImage} size={120} />
        </button>
        <p className={styles.heroName}>
          <span>{me.name || "Профиль"}</span>
          {me.isPremium ? (
            <span className={styles.premium} title="Shalter Premium">
              <Icon name="Star" size={18} />
            </span>
          ) : null}
          <ProfileStatusBadge user={me} size={18} />
        </p>
        <p className={styles.heroStatus}>{me.isGuest ? "в сети · Гость" : "в сети"}</p>
      </div>
      <SettingsSection>
        {me.phone ? <SettingsRow icon="Phone" title={me.phone} subtitle="Телефон" onClick={() => void copyText(me.phone, "Номер скопирован")} /> : null}
        {me.username ? (
          <SettingsRow icon="At" title={`@${me.username}`} subtitle="Имя пользователя" onClick={() => void copyText(`@${me.username}`, "Имя пользователя скопировано")} />
        ) : (
          <SettingsRow icon="At" title="Добавить имя пользователя" subtitle="Имя пользователя" href="/settings/profile" />
        )}
        {me.bio ? <SettingsRow icon="Info" title={me.bio} subtitle="О себе" href="/settings/profile" /> : null}
        <SettingsRow icon="User" title="Мой профиль" onClick={() => openUserProfile(me.id)} />
      </SettingsSection>
      <SettingsSection>{rows(group("main"))}</SettingsSection>
      <SettingsSection>{rows(group("extra"))}</SettingsSection>
      {admin.length ? <SettingsSection title="Администрирование">{rows(admin)}</SettingsSection> : null}
      <SettingsSection>
        <SettingsRow icon="MessageSquare" color="blue" title="Поддержка — Hugo" onClick={onSupport} />
        <SettingsRow icon="Download" color="green" title="Скачать приложение" href="/download" external />
      </SettingsSection>
      {viewAvatar && me.avatarImage ? <MediaViewer items={[{ kind: "image", url: me.avatarImage, name: me.name }]} index={0} canDownload={false} onClose={() => setViewAvatar(false)} /> : null}
    </SettingsPage>
  );
}
