import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { SettingsPage, SettingsSection } from "@/shared/ui";

import { adminQueries } from "../api/admin";

import styles from "./admin.module.css";

// «Настройки → Донаты» — renderDonations в public/js/views/settings/index.js.

export function DonationsSection() {
  const [params, setParams] = useSearchParams();
  // ?connected / ?error — возврат с OAuth DonationAlerts; плашку показываем один раз и убираем из адреса.
  const [banner] = useState(() => (params.get("connected") ? "connected" : params.get("error") ? "error" : null));
  useEffect(() => {
    if (banner) setParams({}, { replace: true });
  }, [banner, setParams]);
  const query = useQuery(adminQueries.donations());
  const status = query.data;

  return (
    <SettingsPage subtitle="Реальная автоматическая оплата Premium, рекламы и подарков вместо ручного подтверждения — через DonationAlerts и/или DonatePay">
      {banner === "connected" ? <p className={styles.success}>✅ DonationAlerts подключён.</p> : null}
      {banner === "error" ? <p className={styles.error}>Не удалось подключить DonationAlerts — попробуйте ещё раз.</p> : null}
      {query.isError ? <p className={styles.error}>{errorText(query.error)}</p> : null}
      {status ? (
        <>
          <SettingsSection title="DonationAlerts">
            <div className={styles.body}>
              {!status.configured ? (
                <p className={styles.hint}>На сервере не заданы DONATIONALERTS_CLIENT_ID / DONATIONALERTS_CLIENT_SECRET / DONATIONALERTS_REDIRECT_URI — без них подключение недоступно.</p>
              ) : status.connected ? (
                <p className={styles.boxTitle}>{`Подключено${status.username ? ` как @${status.username}` : ""} ✅`}</p>
              ) : (
                <a className={styles.accent} href="/api/donation-alerts/connect">
                  Подключить DonationAlerts
                </a>
              )}
            </div>
          </SettingsSection>
          <SettingsSection title="DonatePay">
            <div className={styles.body}>
              {status.donatePayConfigured ? (
                <p className={styles.boxTitle}>Настроен ✅</p>
              ) : (
                <p className={styles.hint}>
                  На сервере не заданы DONATEPAY_API_TOKEN / DONATEPAY_PAGE_URL — без них DonatePay недоступен (см. .env.example). В отличие от DonationAlerts, отдельного шага «Подключить» здесь нет
                  — достаточно переменных.
                </p>
              )}
            </div>
          </SettingsSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
