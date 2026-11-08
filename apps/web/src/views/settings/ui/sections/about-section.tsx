import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { applyUpdate, checkForUpdate, currentVersion, useAppUpdate } from "@/shared/lib/app-update";
import { SettingsPage, SettingsRow, SettingsSection, toast } from "@/shared/ui";

import { aboutQueries } from "../../api/about-api";
import { useOpenSupport } from "../../model/use-open-support";

import styles from "./about-section.module.css";

const ABOUT_TEAM: { name: string; role: string; url?: string }[] = [
  { name: "Николаенко Матвей", role: "Создатель Shalter", url: "https://shalter.ru" },
  { name: "Плюшкин Семён", role: "Разработчик Shalter" },
  { name: "Spitsa Crimea", role: "Партнёр Shalter", url: "https://spitsa-crimea.ru" },
  { name: "Shalter", role: "Независимый проект" },
];

/** «О приложении» — renderAbout: логотип, версия, ссылки и поддержка. */
export function AboutSection() {
  // Версия открытой сборки, а не сервера: с ожидающим обновлением они разные.
  const serverVersion = useQuery(aboutQueries.version()).data?.version;
  const version = currentVersion() ?? serverVersion;
  const openSupport = useOpenSupport();
  const { available: updateAvailable, updating } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  // Есть новая версия — обновляемся сразу; нет — так и говорим.
  const update = async () => {
    if (updateAvailable || updating) return void applyUpdate();
    setChecking(true);
    const found = await checkForUpdate();
    setChecking(false);
    if (found) void applyUpdate();
    else toast("У вас последняя версия Shalter");
  };
  return (
    <SettingsPage>
      <div className={styles.hero}>
        <img className={styles.logo} src="/icons/icon-192.png" alt="" onError={(e) => e.currentTarget.remove()} />
        <h2 className={styles.title}>Shalter</h2>
        <p className={styles.subtitle}>Мессенджер с чатами, звонками, историями, ботами и звёздами — без стороннего сервера: всё работает на вашей собственной инсталляции.</p>
      </div>
      <SettingsSection>
        <SettingsRow icon="Info" color="grey" title="Версия" titleRight={version || "—"} />
        <SettingsRow
          icon="RotateCw"
          color="blue"
          title={updating ? "Обновляем…" : updateAvailable ? "Обновить приложение" : checking ? "Проверяем обновления…" : "Проверить обновления"}
          subtitle={updateAvailable ? "Вышла новая версия — обновится без переустановки" : undefined}
          accent={updateAvailable}
          disabled={checking || updating}
          onClick={() => void update()}
        />
        {ABOUT_TEAM.map((m) =>
          m.url ? (
            <SettingsRow key={m.name} icon="Users" color="purple" title={m.name} subtitle={m.role} href={m.url} external newTab />
          ) : (
            <SettingsRow key={m.name} icon="Users" color="purple" title={m.name} subtitle={m.role} />
          )
        )}
      </SettingsSection>
      <SettingsSection title="Ссылки">
        <SettingsRow icon="Download" color="green" title="Скачать приложение" href="/download" external />
        <SettingsRow icon="Users" color="orange" title="Сотрудничество" href="/promo" external />
        <SettingsRow icon="MessageSquare" color="blue" title="Поддержка — Hugo" onClick={openSupport} />
      </SettingsSection>
    </SettingsPage>
  );
}
