import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Button, Dialog, Icon, type IconName, SettingsPage, SettingsRow, SettingsSection, TextField, toast } from "@/shared/ui";

import { createOAuthApp, deleteOAuthApp, type OAuthApp, oauthAppSecret, oauthAppsQueries, type OAuthSecret, regenerateOAuthApp } from "../api/oauth-apps";

import styles from "./oauth-apps.module.css";

type Shown = { name: string; secret: OAuthSecret; fresh: boolean };

/**
 * «Настройки → Войти через Shalter» (renderOAuthApps): свои приложения, их ключи и инструкция
 * для разработчика. Экран согласия /oauth/authorize — отдельно.
 */
export function OAuthAppsSection() {
  const client = useQueryClient();
  const apps = useQuery(oauthAppsQueries.mine()).data ?? [];
  const [name, setName] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<OAuthSecret | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const origin = window.location.origin;
  const setApps = (fn: (list: OAuthApp[]) => OAuthApp[]) => client.setQueryData(oauthAppsQueries.mine().queryKey, (list) => fn(list ?? []));

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { app } = await createOAuthApp(name.trim(), redirectUri.trim());
      const { clientSecret, ...rest } = app;
      setApps((list) => [rest, ...list]);
      const secret = { clientId: app.clientId, clientSecret };
      setFresh(secret);
      setShown({ name: app.name, secret, fresh: true });
      setName("");
      setRedirectUri("");
    } catch (err) {
      setCreateError(errorText(err, "Не удалось создать приложение"));
    }
    setCreating(false);
  };

  const remove = async (app: OAuthApp) => {
    if (!(await askConfirm(`Удалить приложение «${app.name}»? Все, кто вошёл через него, будут отключены.`, { okLabel: "Удалить", danger: true }))) return;
    try {
      await deleteOAuthApp(app.id);
      setApps((list) => list.filter((a) => a.id !== app.id));
      if (fresh?.clientId === app.clientId) setFresh(null);
    } catch (err) {
      toast(errorText(err, "Не удалось удалить приложение"), { error: true });
    }
  };

  const regenerate = async (app: OAuthApp) => {
    if (!(await askConfirm(`Перегенерировать секрет «${app.name}»? Старый секрет сразу перестанет работать.`, { okLabel: "Перегенерировать", danger: true }))) return;
    try {
      const { app: updated } = await regenerateOAuthApp(app.id);
      const secret = { clientId: updated.clientId, clientSecret: updated.clientSecret };
      setFresh(secret);
      setShown({ name: updated.name ?? app.name, secret, fresh: true });
    } catch (err) {
      toast(errorText(err, "Не удалось перегенерировать секрет"), { error: true });
    }
  };

  const showSecret = async (app: OAuthApp) => {
    try {
      setShown({ name: app.name, secret: await oauthAppSecret(app.id), fresh: false });
    } catch (err) {
      toast(errorText(err, "Не удалось получить ключ"), { error: true });
    }
  };

  const action = (icon: IconName, title: string, onClick: () => void, danger = false) => (
    <button type="button" className={danger ? `${styles.iconButton} ${styles.danger}` : styles.iconButton} title={title} aria-label={title} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );

  return (
    <SettingsPage subtitle="Разрешите своему сайту принимать вход через Shalter — как «Войти через VK»">
      <SettingsSection>
        <SettingsRow icon="Globe" title="Документация для разработчиков" href="/oauth-docs" external />
      </SettingsSection>
      <SettingsSection title="Новое приложение">
        <div className={styles.pad}>
          <TextField placeholder="Название приложения" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField className={styles.mono} placeholder="https://ваш-сайт.example/callback" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} />
          <p className={styles.hint}>redirect_uri — адрес на вашем сайте, куда Shalter вернёт человека после входа (https://, кроме localhost для разработки).</p>
          {createError ? <p className={styles.error}>{createError}</p> : null}
          <Button disabled={creating} onClick={() => void create()}>
            {creating ? "Создаём…" : "Создать приложение"}
          </Button>
        </div>
      </SettingsSection>
      {fresh ? (
        <SettingsSection title="Секрет — сохраните сейчас, повторно не покажется">
          <div className={styles.pad}>
            <div className={styles.codeRow}>
              <span className={styles.mono}>client_id: {fresh.clientId}</span>
            </div>
            <div className={styles.codeRow}>
              <span className={styles.mono}>client_secret: {fresh.clientSecret}</span>
              {action("Copy", "Скопировать секрет", () => void copyText(fresh.clientSecret))}
            </div>
            <p className={styles.hint}>client_secret нужен только вашему серверу (для POST /api/oauth/token) — никогда не кладите его в код браузера/приложения.</p>
          </div>
        </SettingsSection>
      ) : null}
      <p className={styles.listTitle}>Ваши приложения — {apps.length}</p>
      {apps.length === 0 ? (
        <p className={styles.empty}>Пока ничего не зарегистрировано</p>
      ) : (
        <div className={styles.list}>
          {apps.map((a) => (
            <div key={a.id} className={styles.row}>
              <div className={styles.rowBody}>
                <p className={styles.rowName}>{a.name}</p>
                <p className={`${styles.hint} ${styles.mono}`}>{a.redirectUri}</p>
                <p className={`${styles.hint} ${styles.mono}`}>client_id: {a.clientId}</p>
              </div>
              {action("Copy", "Показать и скопировать ключ", () => void showSecret(a))}
              {action("Key", "Перегенерировать секрет", () => void regenerate(a))}
              {action("Trash", "Удалить", () => void remove(a), true)}
            </div>
          ))}
        </div>
      )}
      <SettingsSection title="Как подключить">
        <div className={styles.pad}>
          <p className={styles.hint}>1. Отправьте человека на страницу входа с вашими client_id и redirect_uri — он подтверждает вход и возвращается к вам с кодом.</p>
          <p className={`${styles.hint} ${styles.mono}`}>{`${origin}/oauth/authorize?client_id=ВАШ_CLIENT_ID&redirect_uri=ВАШ_REDIRECT_URI&state=что-угодно`}</p>
          <p className={styles.hint}>2. Ваш сервер меняет код на токен (client_secret — только на сервере, не в браузере):</p>
          <CodeBlock
            text={`curl -X POST ${origin}/api/oauth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"client_id":"...","client_secret":"...","code":"...","redirect_uri":"..."}'`}
          />
          <p className={styles.hint}>3. Токеном из ответа проверяете, что вход действительно сработал, и получаете профиль:</p>
          <CodeBlock text={`curl ${origin}/api/oauth/userinfo \\\n  -H "Authorization: Bearer ВАШ_ACCESS_TOKEN"`} />
        </div>
      </SettingsSection>
      {shown ? <SecretDialog {...shown} onClose={() => setShown(null)} /> : null}
    </SettingsPage>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <div className={styles.codeBlock}>
      <pre className={styles.mono}>{text}</pre>
      <button type="button" className={styles.iconButton} title="Скопировать" aria-label="Скопировать" onClick={() => void copyText(text)}>
        <Icon name="Copy" size={14} />
      </button>
    </div>
  );
}

/** Ключ приложения (oauthSecretDialog.js): fresh — только что выдан, иначе — действующий. */
function SecretDialog({ name, secret, fresh, onClose }: Shown & { onClose: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const row = (label: string, value: string) => (
    <div className={styles.codeRow}>
      <span className={`${styles.mono} ${styles.breakAll}`}>
        {label}: {value}
      </span>
      <button
        type="button"
        className={styles.iconButton}
        title={`Скопировать ${label}`}
        aria-label={`Скопировать ${label}`}
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => setNote(`${label} скопирован ✓`),
            () => setNote("Не удалось скопировать — выделите вручную")
          )
        }
      >
        <Icon name="Copy" size={16} />
      </button>
    </div>
  );
  return (
    <Dialog title={`Ключ приложения «${name}»`} onClose={onClose}>
      <p className={styles.hint}>
        {fresh
          ? "Сохраните client_secret. Посмотреть снова можно кнопкой с ключом рядом с приложением; перевыпуск делает старый секрет недействительным."
          : "Это действующий ключ приложения. client_secret держите только на сервере — в браузер его отдавать нельзя."}
      </p>
      {row("client_id", secret.clientId)}
      {row("client_secret", secret.clientSecret)}
      {note ? <p className={styles.hint}>{note}</p> : null}
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}
