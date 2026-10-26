import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { Icon, SettingsButton, SettingsPage, SettingsSection } from "@/shared/ui";

import { openPartnerChat, partnersQueries } from "../api/partners";

import styles from "./partners.module.css";

/** «Настройки → Партнёрка» (renderPartners): условия и чат с администратором. */
export function PartnersSection() {
  const navigate = useNavigate();
  const info = useQuery(partnersQueries.me());
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openChat = async () => {
    setOpening(true);
    setOpenError(null);
    try {
      const { chatId } = await openPartnerChat();
      void navigate(`/chat/${chatId}`);
    } catch (err) {
      setOpenError(errorText(err, "Не удалось открыть чат"));
      setOpening(false);
    }
  };

  return (
    <SettingsPage>
      <div className={styles.hero}>
        <span className={styles.heroIcon}>
          <Icon name="Users" size={52} />
        </span>
        <h2 className={styles.title}>Партнёрская программа</h2>
        <p className={styles.subtitle}>Условия сотрудничества и связь с администрацией.</p>
      </div>
      {info.error ? <p className={styles.error}>{errorText(info.error)}</p> : null}
      {info.data ? (
        <SettingsSection title="Тарифы">
          <p className={styles.text}>{info.data.tariffText}</p>
        </SettingsSection>
      ) : null}
      <SettingsSection caption={openError}>
        <SettingsButton icon="MessageSquare" disabled={opening} onClick={() => void openChat()}>
          {opening ? "Открываем чат…" : "Написать администратору"}
        </SettingsButton>
      </SettingsSection>
    </SettingsPage>
  );
}
