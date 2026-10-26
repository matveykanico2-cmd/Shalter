import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { chatQueries } from "@/entities/chat";
import { sessionQueries, useSession } from "@/entities/session";
import { type Settings, useSettings, useUpdateSettings } from "@/entities/settings";

import { ws } from "@/shared/api";
import { clearCache } from "@/shared/lib/local-cache";
import { hasPasscode } from "@/shared/lib/passcode";
import { passkeysSupported } from "@/shared/lib/passkey";
import { plural } from "@/shared/lib/presence";
import { askConfirm, ChoiceDialog, SettingsButton, SettingsPage, SettingsRow, SettingsSection, toast, useSettingsSubpage } from "@/shared/ui";

import { deleteAccount, privacyQueries, type TwoFactorStatus } from "../api/privacy-settings";
import { levelLabel, PRIVACY_RULES, type PrivacyRule } from "../config/privacy-rules";
import { exportMyData } from "../lib/export-data";

import { ChangeEmailDialog, ChangePasswordDialog, DeleteAccountDialog } from "./credentials-dialog";
import { RemovePasscodeDialog, SetPasscodeDialog } from "./passcode-dialog";
import { BlockedPage, PasskeysPage, RulePage } from "./privacy-pages";
import { TwoFactorDisableDialog, TwoFactorSetupDialog } from "./two-factor-dialog";

type Sub = { title: string; rule: PrivacyRule } | { title: "Заблокированные"; blocked: true } | { title: "Ключи доступа"; passkeys: true };
type Open = "passcode" | "passcodeMenu" | "removePasscode" | "2fa" | "2faOff" | "email" | "password" | "delete" | null;

const twoFactorLabel = (tf: TwoFactorStatus | undefined) =>
  !tf?.enabled
    ? "Выкл."
    : tf.method === "password"
      ? "Вкл. · облачный пароль"
      : `Вкл. · ${tf.method === "chat" ? "код в чате Shalter" : "приложение-аутентификатор"}`;

function ruleSubtitle(settings: Settings, key: PrivacyRule["key"]) {
  const exc = settings.privacy.exceptions?.[key];
  const allow = exc?.allow.length ?? 0;
  const deny = exc?.deny.length ?? 0;
  const extra = [allow ? `+${allow}` : null, deny ? `−${deny}` : null].filter(Boolean).join(" ");
  return extra ? `${levelLabel(settings.privacy[key])} (${extra})` : levelLabel(settings.privacy[key]);
}

/** «Конфиденциальность» — renderPrivacy в public/js/views/settings/index.js. */
export function PrivacySection() {
  const client = useQueryClient();
  const me = useSession().data?.user;
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const twoFactor = useQuery(privacyQueries.twoFactor()).data;
  const blockedUsers = useQuery(privacyQueries.blocked()).data ?? [];
  const passkeys = useQuery({ ...privacyQueries.passkeys(), enabled: passkeysSupported() }).data ?? [];
  const [sub, setSub] = useState<Sub | null>(null);
  const [open, setOpen] = useState<Open>(null);
  // Код-пароль — в localStorage этого устройства, не в кэше запросов.
  const [passcodeOn, setPasscodeOn] = useState(hasPasscode);
  useSettingsSubpage(sub?.title ?? null, () => setSub(null));

  if (!settings || !me) return null;

  // Список — с сервера, а кто ещё заблокирован — по сессии (разблокировали в чате — пропал и здесь).
  const blocked = blockedUsers.filter((u) => me.blockedUserIds.includes(u.id));
  const drafts = Object.values(settings.drafts ?? {}).filter(Boolean).length;
  const close = () => setOpen(null);
  const refetchTwoFactor = () => void client.invalidateQueries({ queryKey: privacyQueries.twoFactor().queryKey });

  let content;
  if (sub && "rule" in sub) content = <RulePage rule={sub.rule} settings={settings} />;
  else if (sub && "blocked" in sub) content = <BlockedPage users={blocked} />;
  else if (sub && "passkeys" in sub) content = <PasskeysPage passkeys={passkeys} />;
  else
    content = (
      <>
        {/* Раскладка tweb: верхний блок без заголовка — безопасность, затем «Конфиденциальность». */}
        <SettingsSection caption="Сеансы на всех ваших устройствах можно посмотреть и завершить в «Активных сеансах».">
          <SettingsRow
            icon="UserX"
            title="Заблокированные"
            subtitle={blocked.length ? `${blocked.length} ${plural(blocked.length, "пользователь", "пользователя", "пользователей")}` : "Нет"}
            onClick={() => setSub({ title: "Заблокированные", blocked: true })}
          />
          <SettingsRow icon="Monitor" title="Активные сеансы" subtitle="Устройства, где выполнен вход" href="/settings/devices" />
          <SettingsRow icon="Lock" title="Код-пароль" subtitle={passcodeOn ? "Вкл." : "Выкл."} onClick={() => setOpen(passcodeOn ? "passcodeMenu" : "passcode")} />
          <SettingsRow icon="Shield" title="Двухэтапная аутентификация" subtitle={twoFactorLabel(twoFactor)} onClick={() => setOpen(twoFactor?.enabled ? "2faOff" : "2fa")} />
          <SettingsRow icon="At" title="Почта для входа" subtitle={me.email || "Не указана"} onClick={() => setOpen("email")} />
          {passkeysSupported() ? (
            <SettingsRow
              icon="Key"
              title="Ключи доступа"
              subtitle={passkeys.length ? `${passkeys.length} ${plural(passkeys.length, "ключ", "ключа", "ключей")}` : "Выкл."}
              onClick={() => setSub({ title: "Ключи доступа", passkeys: true })}
            />
          ) : null}
        </SettingsSection>
        <SettingsSection title="Конфиденциальность" caption="Можно ограничить, кто видит ваши данные, может вам писать, звонить и приглашать в группы.">
          {PRIVACY_RULES.map((rule) => (
            <SettingsRow key={rule.key} title={rule.label} subtitle={ruleSubtitle(settings, rule.key)} onClick={() => setSub({ title: rule.label, rule })} />
          ))}
        </SettingsSection>
        <SettingsSection title="Вход в аккаунт">
          <SettingsRow icon="Key" title="Пароль" subtitle="При смене остальные сеансы завершаются" onClick={() => setOpen("password")} />
          <SettingsRow
            icon="Lock"
            title="Пароль при запуске"
            subtitle="Спрашивать пароль каждый раз"
            toggle={{ checked: !!settings.requirePasswordOnLaunch, onChange: (v) => update.mutate({ requirePasswordOnLaunch: v }) }}
          />
        </SettingsSection>
        <SettingsSection title="Черновики">
          <SettingsButton
            icon="Trash"
            danger
            onClick={async () => {
              if (!drafts) return toast("Черновиков нет");
              if (!(await askConfirm(`Удалить все черновики (${drafts})? Набранный, но не отправленный текст пропадёт во всех чатах.`))) return;
              await update.mutateAsync({ drafts: {} }).catch(() => {});
              void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
              toast("Черновики удалены");
            }}
          >
            Удалить все черновики
          </SettingsButton>
        </SettingsSection>
        <SettingsSection
          title="Экспорт данных"
          caption="Скачивает JSON‑историю чатов и все вложения (фото, видео, голосовые). Доступно только владельцу аккаунта."
        >
          <SettingsButton icon="Download" onClick={() => void exportMyData()}>
            Выгрузить переписку и медиа на устройство
          </SettingsButton>
        </SettingsSection>
        <SettingsSection caption="Безвозвратно удаляет аккаунт, чаты и ботов. Отменить нельзя.">
          <SettingsButton icon="Trash" danger onClick={() => setOpen("delete")}>
            Удалить аккаунт
          </SettingsButton>
        </SettingsSection>
      </>
    );

  return (
    <SettingsPage>
      {content}
      {open === "passcode" ? <SetPasscodeDialog onDone={() => setPasscodeOn(true)} onClose={close} /> : null}
      {open === "passcodeMenu" ? (
        <ChoiceDialog
          title="Код-пароль"
          choices={[
            // ChoiceDialog сначала закрывается (onClose), потом выбор открывает следующее окно.
            { label: "Изменить код-пароль", onClick: () => setOpen("passcode") },
            { label: "Отключить код-пароль", danger: true, onClick: () => setOpen("removePasscode") },
          ]}
          onClose={close}
        />
      ) : null}
      {open === "removePasscode" ? <RemovePasscodeDialog onDone={() => setPasscodeOn(false)} onClose={close} /> : null}
      {open === "2fa" ? <TwoFactorSetupDialog onEnabled={refetchTwoFactor} onClose={close} /> : null}
      {open === "2faOff" && twoFactor ? (
        <TwoFactorDisableDialog
          method={twoFactor.method}
          onDisabled={() => client.setQueryData(privacyQueries.twoFactor().queryKey, { ...twoFactor, enabled: false, recoveryCodesLeft: 0 })}
          onClose={close}
        />
      ) : null}
      {open === "email" ? (
        <ChangeEmailDialog
          currentEmail={me.email}
          onDone={(email) => {
            if (email) client.setQueryData(sessionQueries.current().queryKey, (s) => (s?.user ? { ...s, user: { ...s.user, email } } : s));
            toast("Адрес почты изменён");
          }}
          onClose={close}
        />
      ) : null}
      {open === "password" ? <ChangePasswordDialog onDone={() => toast("Пароль изменён, остальные сеансы завершены")} onClose={close} /> : null}
      {open === "delete" ? (
        <DeleteAccountDialog
          onConfirm={async (password) => {
            const { remaining } = await deleteAccount(password);
            clearCache();
            // Полная перезагрузка: кэш запросов и сокет удалённого аккаунта не должны остаться.
            ws.stop();
            window.location.href = remaining?.length ? "/" : "/login";
          }}
          onClose={close}
        />
      ) : null}
    </SettingsPage>
  );
}

