import { useQuery } from "@tanstack/react-query";

import { isInstalledApp } from "@/shared/lib/platform";
import { SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import { aboutQueries } from "../../api/about-api";
import { useOpenSupport } from "../../model/use-open-support";

import styles from "./about-section.module.css";

const ABOUT_TEAM: { name: string; role: string; url?: string }[] = [
  { name: "Николаенко Матвей", role: "Создатель Shalter", url: "https://shalter.ru" },
  { name: "Shalter", role: "Независимый проект" },
];

/** «О приложении» — renderAbout: логотип, версия, ссылки и поддержка. */
export function AboutSection() {
  const version = useQuery(aboutQueries.version()).data?.version;
  const openSupport = useOpenSupport();
  return (
    <SettingsPage>
      <div className={styles.hero}>
        <img className={styles.logo} src="/icons/icon-192.png" alt="" onError={(e) => e.currentTarget.remove()} />
        <h2 className={styles.title}>Shalter</h2>
        <p className={styles.subtitle}>Мессенджер с чатами, звонками, историями, ботами и звёздами — без стороннего сервера: всё работает на вашей собственной инсталляции.</p>
      </div>
      <SettingsSection>
        <SettingsRow icon="Info" color="grey" title="Версия" titleRight={version || "—"} />
        {ABOUT_TEAM.map((m) =>
          m.url ? (
            <SettingsRow key={m.name} icon="Users" color="purple" title={m.name} subtitle={m.role} href={m.url} external newTab />
          ) : (
            <SettingsRow key={m.name} icon="Users" color="purple" title={m.name} subtitle={m.role} />
          )
        )}
      </SettingsSection>
      <SettingsSection title="Ссылки">
        {isInstalledApp() ? null : <SettingsRow icon="Download" color="green" title="Скачать приложение" href="/download" external />}
        <SettingsRow icon="Users" color="orange" title="Сотрудничество" href="/promo" external />
        <SettingsRow icon="MessageSquare" color="blue" title="Поддержка — Hugo" onClick={openSupport} />
      </SettingsSection>
    </SettingsPage>
  );
}
