import { useId, useRef, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { askConfirm, Avatar, Button, Dialog, EmojiText, Icon, TextField, toast } from "@/shared/ui";

import { type Bot, broadcastBot, updateBot } from "../api/bots";

import styles from "./bots.module.css";

/** «Новый бот» (createBotDialog.js): фото, имя и описание; после создания — токен. */
export function CreateBotDialog({ onSubmit, onClose }: { onSubmit: (name: string, avatarImage: string | null, description: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const value = name.trim();
    if (!value) return setInvalid(true);
    setBusy(true);
    try {
      await onSubmit(value, avatarImage, description.trim());
    } catch (err) {
      toast(errorText(err, "Не удалось создать бота"), { error: true });
    }
    setBusy(false);
  };

  return (
    <Dialog title="Новый бот" onClose={onClose}>
      <button type="button" className={styles.avatarEdit} title="Выбрать фото" onClick={() => fileInput.current?.click()}>
        <Avatar size={96} name={name || "?"} image={avatarImage} />
        <span className={styles.avatarIcon}>
          <Icon name="Camera" size={30} />
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Фото"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void fileToImageDataUrl(file, 512).then(setAvatarImage);
        }}
      />
      <label className={styles.field}>
        <span>Имя бота</span>
        <TextField
          value={name}
          maxLength={64}
          autoFocus
          aria-invalid={invalid || undefined}
          className={invalid ? styles.invalid : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setInvalid(false);
          }}
        />
      </label>
      <label className={styles.field}>
        <span>Описание (необязательно)</span>
        <textarea className={styles.textarea} rows={2} maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <p className={styles.hint}>После создания вы получите токен — с ним бота можно программировать через Bot API или прямо в Shalter.</p>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={busy} onClick={() => void submit()}>
          Создать
        </Button>
      </div>
    </Dialog>
  );
}

/** Токен бота (botTokenDialog.js): fresh — только что выдан, иначе — действующий. */
export function BotTokenDialog({ botName, token, fresh = true, onClose }: { botName: string; token: string; fresh?: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Dialog title={`Токен бота «${botName}»`} onClose={onClose}>
      <p className={styles.hint}>
        {fresh
          ? "Сохраните его. Посмотреть снова можно кнопкой с ключом рядом с ботом; перевыпуск делает старый токен недействительным."
          : "Это действующий токен бота. Кто им владеет — тот и есть бот, поэтому не публикуйте его."}
      </p>
      <div className={styles.codeRow}>
        <span className={styles.token}>{token}</span>
        <button
          type="button"
          className={styles.iconButton}
          title="Скопировать токен"
          aria-label="Скопировать токен"
          onClick={() =>
            void navigator.clipboard.writeText(token).then(
              () => setCopied("Скопировано ✓"),
              () => setCopied("Не удалось скопировать — выделите вручную")
            )
          }
        >
          <Icon name="Copy" size={16} />
        </button>
      </div>
      {copied ? <p className={styles.hint}>{copied}</p> : null}
      <p className={styles.hint}>
        Как этим пользоваться —{" "}
        <a href="/bots" target="_blank" rel="noreferrer">
          документация по Bot API
        </a>
        .
      </p>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}

/** «Настройки бота» (editBotDialog.js): фото, имя, юзернейм, описание, мини-приложение, рассылка. */
export function EditBotDialog({ bot: initial, onSaved, onClose }: { bot: Bot; onSaved: () => void; onClose: () => void }) {
  const fieldId = useId();
  const [bot, setBot] = useState(initial);
  const [avatarImage, setAvatarImage] = useState<string | null>(initial.user.avatarImage ?? null);
  const [name, setName] = useState(initial.user.name ?? "");
  const [username, setUsername] = useState(initial.user.username ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [appMode, setAppMode] = useState<"none" | "url">(initial.appUrl ? "url" : "none");
  const [appUrl, setAppUrl] = useState(initial.appUrl ?? "");
  const [appName, setAppName] = useState(initial.appName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastNotice, setBroadcastNotice] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await updateBot(bot.id, {
        name: name.trim(),
        description: description.trim(),
        username: username.trim(),
        avatarImage,
        appName: appName.trim(),
        appUrl: appMode === "url" ? appUrl.trim() : "",
      });
      setBot({ ...bot, ...res.bot });
      setNotice("Сохранено");
      onSaved();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    }
    setBusy(false);
  };

  const sendBroadcast = async () => {
    const text = broadcast.trim();
    if (broadcastBusy || !text) return;
    if (!(await askConfirm("Отправить это сообщение всем пользователям бота?", { okLabel: "Отправить" }))) return;
    setBroadcastBusy(true);
    setBroadcastNotice(null);
    setBroadcastError(null);
    try {
      const res = await broadcastBot(bot.id, text);
      setBroadcast("");
      setBroadcastNotice(`Отправлено: ${res.sent}`);
    } catch (err) {
      setBroadcastError(errorText(err, "Не удалось отправить рассылку"));
    }
    setBroadcastBusy(false);
  };

  return (
    <Dialog title="Настройки бота" onClose={onClose}>
      <div className={styles.avatarRow}>
        <Avatar size={64} name={bot.user.name} color={bot.user.avatarColor} image={avatarImage} />
        <div className={styles.avatarActions}>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Загрузить фото
          </Button>
          {avatarImage ? (
            <Button variant="secondary" className={styles.danger} onClick={() => setAvatarImage(null)}>
              Убрать фото
            </Button>
          ) : null}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void fileToImageDataUrl(file, 512).then(setAvatarImage);
          }}
        />
      </div>
      <div className={styles.fields}>
        <p id={`${fieldId}-name`} className={styles.label}>
          Имя
        </p>
        <input aria-labelledby={`${fieldId}-name`} className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        <p id={`${fieldId}-username`} className={styles.label}>
          Юзернейм
        </p>
        <div className={styles.handle}>
          <span className={styles.at}>@</span>
          <input aria-labelledby={`${fieldId}-username`} className={`${styles.input} ${styles.mono}`} value={username} onChange={(e) => setUsername(e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, ""))} />
        </div>
        <p className={styles.hint}>Должен заканчиваться на _bot — так его отличают от аккаунта человека.</p>
        <p id={`${fieldId}-description`} className={styles.label}>
          Описание
        </p>
        <textarea aria-labelledby={`${fieldId}-description`} className={styles.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className={styles.block}>
        <p className={styles.blockTitle}>Мини-приложение</p>
        <p className={styles.hint}>
          Страница с интерфейсом, которая открывается внутри Shalter кнопкой в шапке чата и знает, кто её открыл —{" "}
          <a href="/bots#apps" target="_blank" rel="noreferrer">
            как это устроено
          </a>
          .
        </p>
        <div className={styles.modes}>
          {(
            [
              { id: "none", label: "Нет" },
              { id: "url", label: "Свой сервер" },
            ] as const
          ).map((m) => (
            <button key={m.id} type="button" aria-pressed={appMode === m.id} className={appMode === m.id ? `${styles.mode} ${styles.modeActive}` : styles.mode} onClick={() => setAppMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {appMode === "url" ? (
          <>
            <input className={`${styles.input} ${styles.mono}`} placeholder="https://example.com/app" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} />
            <p className={styles.hint}>Адрес вашей страницы. Только https (http — для localhost).</p>
            <p id={`${fieldId}-app-name`} className={styles.label}>
              Надпись на кнопке
            </p>
            <input aria-labelledby={`${fieldId}-app-name`} className={styles.input} placeholder="Открыть приложение" value={appName} onChange={(e) => setAppName(e.target.value)} />
          </>
        ) : null}
      </div>
      <div className={styles.block}>
        <p className={styles.blockTitle}>Рассылка</p>
        <p className={styles.hint}>Сообщение от имени бота придёт в личный чат каждому, кто его запустил. Не чаще раза в минуту.</p>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4096}
          placeholder="Текст, который получат все, кто запустил бота"
          value={broadcast}
          onChange={(e) => setBroadcast(e.target.value)}
        />
        {broadcastError ? <p className={styles.error}>{broadcastError}</p> : null}
        {broadcastNotice ? (
          <p className={styles.notice}>
            <EmojiText text={`✅ ${broadcastNotice}`} />
          </p>
        ) : null}
        <Button variant="secondary" disabled={broadcastBusy} onClick={() => void sendBroadcast()}>
          {broadcastBusy ? "Отправляем…" : "Отправить всем"}
        </Button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? (
        <p className={styles.notice}>
          <EmojiText text={`✅ ${notice}`} />
        </p>
      ) : null}
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </Dialog>
  );
}
