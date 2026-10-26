import { useEffect, useState } from "react";

import { PermissionsDialog } from "@/features/permissions";

import { useSettings, useUpdateSettings } from "@/entities/settings";

import { getSoundChoice, MESSAGE_SOUNDS, previewSound, RINGTONES, setSoundChoice } from "@/shared/lib/media/sounds";
import { isInstalledApp } from "@/shared/lib/platform";
import { iosNeedsHomeScreen, type PushDiagnostics, pushDiagnostics, requestPushPermission, resubscribePush } from "@/shared/lib/push";
import { SettingsButton, SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import styles from "./sections.module.css";

const PERMISSION_LABEL: Record<string, string> = { granted: "разрешены", denied: "запрещены", default: "не запрошены" };

/** «Уведомления» — renderNotifications: о сообщениях, звуки, push на этом устройстве и проверка. */
export function NotificationsSection() {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const [diag, setDiag] = useState<PushDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [sounds, setSounds] = useState(getSoundChoice);
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  const refreshDiag = () => void pushDiagnostics().then(setDiag, () => {});
  useEffect(refreshDiag, []);

  if (!settings) return null;
  const notifications = settings.notifications as { previewText?: boolean; sound?: boolean };
  // Сервер сливает настройки по верхнему уровню — notifications шлём целиком.
  const patch = (p: Partial<typeof notifications>) => update.mutate({ notifications: { ...settings.notifications, ...p } });

  // В приложениях браузерного Notification нет — состояние берём из проверки.
  const permState = diag?.разрешение ?? (typeof Notification !== "undefined" ? Notification.permission : null);
  const permLabel = !permState ? (diag ? "не поддерживаются" : "проверяем…") : (PERMISSION_LABEL[permState] ?? permState);
  const androidBrowser = /Android/i.test(navigator.userAgent) && !isInstalledApp() && !window.matchMedia?.("(display-mode: standalone)").matches;

  const soundPicker = (title: string, kind: "message" | "ringtone", list: readonly { id: string; label: string }[]) => (
    <SettingsSection title={title}>
      {list.map((snd) => (
          <SettingsRow
            key={snd.id}
            title={snd.label}
            right={<span className={sounds[kind] === snd.id ? `${styles.radio} ${styles.radioOn}` : styles.radio} aria-hidden />}
            onClick={() => {
              setSoundChoice(kind, snd.id);
              previewSound(kind, snd.id);
              setSounds(getSoundChoice());
            }}
          />
        ))}
    </SettingsSection>
  );

  const chainRow = (label: string, ok: boolean, hint: string | null) => (
    <SettingsRow key={label} icon={ok ? "Check" : "X"} color={ok ? "green" : "red"} title={label} subtitle={hint} />
  );

  return (
    <SettingsPage>
      <SettingsSection title="Уведомления о сообщениях">
        <SettingsRow
          icon="MessageSquare"
          color="blue"
          title="Предпросмотр сообщений"
          subtitle={notifications.previewText ? "Текст сообщения в уведомлении" : "«Новое сообщение» без содержимого"}
          toggle={{ checked: !!notifications.previewText, onChange: (v) => patch({ previewText: v }) }}
        />
        <SettingsRow icon="Volume" color="green" title="Звук" toggle={{ checked: !!notifications.sound, onChange: (v) => patch({ sound: v }) }} />
      </SettingsSection>
      {soundPicker("Звук сообщения", "message", MESSAGE_SOUNDS)}
      {soundPicker("Мелодия звонка", "ringtone", RINGTONES)}
      <SettingsSection
        title="Уведомления на этом устройстве"
        caption={isInstalledApp() ? "Уведомления приходят, даже когда приложение закрыто." : "Уведомления приходят, даже когда вкладка закрыта."}
      >
        <SettingsRow icon="Bell" color="red" title="Статус" titleRight={permLabel} />
        {androidBrowser ? (
          // В браузере на Android уведомления сайта система подписывает «Chrome» — от имени Shalter их показывает только приложение.
          <p className={styles.note}>
            В браузере уведомления приходят от имени Chrome. Чтобы они были от Shalter — со своей иконкой, звуком и без браузера,{" "}
            <a href="/download">установите приложение для Android</a>.
          </p>
        ) : null}
        {iosNeedsHomeScreen() ? (
          <p className={`${styles.note} ${styles.noteDanger}`}>
            На iPhone уведомления приходят, только если Shalter добавлен на экран «Домой»: в Safari нажмите «Поделиться» → «На экран „Домой“», откройте Shalter с иконки и
            разрешите уведомления (нужна iOS 16.4 или новее).
          </p>
        ) : null}
        {permState === "default" ? (
          <SettingsButton icon="Bell" onClick={() => void requestPushPermission().catch(() => false).then(refreshDiag)}>
            Включить уведомления
          </SettingsButton>
        ) : null}
        <SettingsButton
          icon="Download"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void resubscribePush().then((res) => {
              setChecking(false);
              if (!res.ok) setDiag((d) => (d ? { ...d, ошибка: res.ошибка } : d));
              refreshDiag();
            });
          }}
        >
          {checking ? "Проверяем…" : "Переподключить уведомления"}
        </SettingsButton>
        <SettingsButton icon="Lock" onClick={() => setPermissionsOpen(true)}>
          Камера, микрофон и другие разрешения
        </SettingsButton>
      </SettingsSection>
      <SettingsSection title="Проверка">
        {diag ? (
          <>
            {chainRow("Защищённый адрес (https)", diag.защищённыйАдрес, diag.защищённыйАдрес ? null : "Push работает только по https — по http браузер его не даёт вовсе")}
            {chainRow("Браузер поддерживает push", diag.поддержка, null)}
            {chainRow("Разрешение выдано", diag.разрешение === "granted", diag.разрешение === "denied" ? "Запрещено в настройках браузера — снимите запрет для этого сайта" : null)}
            {chainRow("Подписка создана в браузере", diag.подпискаВБраузере, null)}
            {chainRow("Сервер знает это устройство", diag.подпискаНаСервере, null)}
            {diag.ошибка ? <p className={`${styles.note} ${styles.noteDanger}`}>{diag.ошибка}</p> : null}
          </>
        ) : (
          <SettingsRow title="Проверяем…" />
        )}
      </SettingsSection>
      {permissionsOpen ? (
        <PermissionsDialog
          onClose={() => {
            setPermissionsOpen(false);
            refreshDiag();
          }}
        />
      ) : null}
    </SettingsPage>
  );
}
