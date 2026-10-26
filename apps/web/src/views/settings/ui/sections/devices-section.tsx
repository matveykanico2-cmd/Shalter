import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { timeAgo } from "@/shared/lib/presence";
import { Button, Dialog, Icon, SettingsButton, SettingsPage, SettingsRow, SettingsSection, toast } from "@/shared/ui";

import { type DeviceSession, settingsViewQueries, terminateOtherSessions, terminateSession } from "../../api/settings-api";
import { sessionAppName, sessionPlatform } from "../../lib/sessions";

import styles from "./sections.module.css";

type Confirm = { title: string; text: string; run: () => Promise<unknown> };

/** «Устройства» — renderDevices: это устройство, активные сеансы, завершение. */
export function DevicesSection() {
  const client = useQueryClient();
  const key = settingsViewQueries.sessions().queryKey;
  const sessions = useQuery(settingsViewQueries.sessions()).data;
  const [opened, setOpened] = useState<DeviceSession | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  if (!sessions) return null;
  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);
  const keep = (pred: (s: DeviceSession) => boolean) => client.setQueryData(key, (list) => list?.filter(pred));

  const terminate = (s: DeviceSession) =>
    setConfirm({
      title: "Завершить сеанс?",
      text: "Устройство будет разлогинено.",
      run: async () => {
        await terminateSession(s.deviceId);
        keep((x) => x.deviceId !== s.deviceId);
      },
    });
  const terminateOthers = () =>
    setConfirm({
      title: "Завершить сеансы?",
      text: "Все устройства, кроме этого, будут разлогинены.",
      run: async () => {
        await terminateOtherSessions();
        keep((x) => x.current);
      },
    });

  const row = (s: DeviceSession) => {
    const { app, system } = sessionAppName(s.device);
    const platform = sessionPlatform(s.device);
    return (
      <SettingsRow
        key={s.id}
        icon={platform.icon}
        color={platform.color}
        title={app}
        titleRight={s.current ? null : timeAgo(s.lastActive)}
        midtitle={system || "Shalter"}
        subtitle={s.current ? `${s.location || ""}${s.location ? " · " : ""}в сети` : s.location}
        onClick={() => setOpened(s)}
      />
    );
  };

  return (
    <SettingsPage>
      <div className={styles.mediaHeader}>
        <span className={styles.mediaSticker}>
          <Icon name="Monitor" size={56} />
        </span>
        <p className={styles.mediaSubtitle}>Здесь все устройства, на которых выполнен вход в ваш аккаунт Shalter.</p>
      </div>
      {current ? (
        <SettingsSection title="Это устройство" caption={others.length ? "Выйти на всех устройствах, кроме этого." : null}>
          {row(current)}
          {others.length ? (
            <SettingsButton icon="X" danger onClick={terminateOthers}>
              Завершить все другие сеансы
            </SettingsButton>
          ) : null}
        </SettingsSection>
      ) : null}
      {others.length ? (
        <SettingsSection title="Активные сеансы" caption="Нажмите на сеанс, чтобы посмотреть подробности или завершить его.">
          {others.map(row)}
        </SettingsSection>
      ) : null}
      {opened ? (
        <SessionPopup
          session={opened}
          onClose={() => setOpened(null)}
          onTerminate={
            opened.current
              ? undefined
              : () => {
                  setOpened(null);
                  terminate(opened);
                }
          }
        />
      ) : null}
      {confirm ? <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} /> : null}
    </SettingsPage>
  );
}

/** Подробности сеанса — openSessionPopup. */
function SessionPopup({ session, onClose, onTerminate }: { session: DeviceSession; onClose: () => void; onTerminate?: () => void }) {
  const { app, system } = sessionAppName(session.device);
  const platform = sessionPlatform(session.device);
  return (
    <Dialog title={app} onClose={onClose} className={styles.sessionPopup}>
      <button type="button" className={styles.popupClose} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
        <Icon name="X" size={22} />
      </button>
      <div className={styles.sessionHero}>
        <span className={styles.sessionHeroIcon} data-color={platform.color}>
          <Icon name={platform.icon} size={48} />
        </span>
        <p className={styles.mediaSubtitle}>{session.current ? "в сети" : timeAgo(session.lastActive)}</p>
      </div>
      <SettingsSection title="Информация" caption={session.location ? "Местоположение определено по IP-адресу и может быть неточным." : null}>
        <SettingsRow title="Приложение" right={app} />
        <SettingsRow title="Система" right={system || "—"} />
        <SettingsRow title="Местоположение" right={session.location || "—"} />
      </SettingsSection>
      {onTerminate ? (
        <SettingsSection>
          <SettingsButton icon="X" danger onClick={onTerminate}>
            Завершить сеанс
          </SettingsButton>
        </SettingsSection>
      ) : null}
    </Dialog>
  );
}

/** Подтверждение с пояснением — openCheckboxDialog без галочки. */
function ConfirmDialog({ title, text, run, onClose }: Confirm & { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const ok = async () => {
    setBusy(true);
    try {
      await run();
      onClose();
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось завершить сеанс"), { error: true });
    }
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <p className={styles.dialogText}>{text}</p>
      <Button variant="danger" disabled={busy} onClick={() => void ok()}>
        Завершить
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
