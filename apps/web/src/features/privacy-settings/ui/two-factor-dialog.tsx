import { type ReactNode, useEffect, useRef, useState } from "react";

import { useWsEvent } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { prettyQrSvg } from "@/shared/lib/qr/pretty-qr";
import { Button, Dialog, Icon, TextField } from "@/shared/ui";

import { disableTwoFactor, enableTwoFactor, sendTwoFactorCode, setCloudPassword, setupTwoFactor, type TwoFactorMethod } from "../api/privacy-settings";

import styles from "./privacy.module.css";

// Код из служебного чата: «Код подтверждения: 123456».
const SHALTER_BOT = "bot_shalter";
const codeFromMessage = (text: unknown) => String(text ?? "").match(/Код подтверждения:\s*(\d{6})/)?.[1] ?? null;

type Step = "method" | "cloud" | "loading" | "error" | "scan" | "recovery";

/** Включение 2FA — openTwoFactorSetupDialog (components/twoFactorDialog.js). */
export function TwoFactorSetupDialog({ onEnabled, onClose }: { onEnabled: () => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<TwoFactorMethod>("totp");
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [cloud, setCloud] = useState({ password: "", repeat: "", hint: "", account: "" });
  const busyRef = useRef(false);

  const confirm = async (value = code) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await enableTwoFactor(value);
      setRecoveryCodes(res.recoveryCodes ?? []);
      setStep("recovery");
      onEnabled();
    } catch (err) {
      setError(errorText(err, "Неверный код"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Код из чата с Shalter подставляется сам — не нужно уходить из настройки в чат.
  const pendingCode = useRef<string | null>(null);
  useWsEvent("message:new", ({ message }) => {
    if (method !== "chat" || (step !== "scan" && step !== "loading") || message?.senderId !== SHALTER_BOT) return;
    const found = codeFromMessage(message.text);
    if (!found) return;
    setCode(found);
    // Пришёл раньше ответа на setup — отправим, когда окно перейдёт к вводу кода.
    if (step === "scan") void confirm(found);
    else pendingCode.current = found;
  });
  useEffect(() => {
    if (step !== "scan" || !pendingCode.current) return;
    const found = pendingCode.current;
    pendingCode.current = null;
    void confirm(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const start = async (chosen: "totp" | "chat") => {
    setMethod(chosen);
    setCode("");
    setStep("loading");
    try {
      const res = await setupTwoFactor(chosen);
      setTotp(res.method === "totp" ? { secret: res.secret, uri: res.otpauthUri } : null);
      setStep("scan");
    } catch (err) {
      setError(errorText(err, "Не удалось начать настройку"));
      setStep("error");
    }
  };

  const saveCloud = async () => {
    setError(null);
    let problem: string | null = null;
    if (cloud.password.length < 6) problem = "Облачный пароль — не короче 6 знаков";
    else if (cloud.password !== cloud.repeat) problem = "Пароли не совпадают";
    else if (!cloud.account) problem = "Введите пароль от аккаунта";
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await setCloudPassword({ password: cloud.password, hint: cloud.hint, accountPassword: cloud.account });
      onEnabled();
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось включить"));
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const cloudField = (label: string, key: keyof typeof cloud, props: Record<string, string | number>) => (
    <label className={styles.field}>
      <span className={styles.hint}>{label}</span>
      <TextField value={cloud[key]} onChange={(e) => setCloud((c) => ({ ...c, [key]: e.target.value }))} {...props} />
    </label>
  );

  let body: ReactNode;
  if (step === "method") {
    body = (
      <>
        <p className={styles.hint}>Выберите, как подтверждать вход. Второй фактор можно будет сменить, отключив и включив защиту заново.</p>
        <button type="button" className={styles.methodButton} onClick={() => void start("chat")}>
          <span className={styles.methodTitle}>💬 Код в чате Shalter</span>
          <span className={styles.hint}>Код придёт сюда же, в служебный чат Shalter — как коды для входа. Ничего устанавливать не нужно.</span>
        </button>
        <button type="button" className={styles.methodButton} onClick={() => void start("totp")}>
          <span className={styles.methodTitle}>📱 Приложение-аутентификатор</span>
          <span className={styles.hint}>Google Authenticator, Aegis, 1Password. Надёжнее: код создаётся на вашем устройстве и не проходит через Shalter.</span>
        </button>
        <button
          type="button"
          className={styles.methodButton}
          onClick={() => {
            setMethod("password");
            setStep("cloud");
          }}
        >
          <span className={styles.methodTitle}>🔐 Облачный пароль</span>
          <span className={styles.hint}>
            Отдельный пароль, который спрашивают при входе после обычного. Ничего устанавливать и никуда ходить за кодом не нужно — но и восстановить его, если
            забыть, нельзя.
          </span>
        </button>
        <Button variant="link" onClick={onClose}>
          Отмена
        </Button>
      </>
    );
  } else if (step === "cloud") {
    body = (
      <>
        <p className={styles.hint}>
          Этот пароль спросят при каждом входе с нового устройства — после обычного пароля. Забыть его нельзя: восстановления нет, поэтому придумайте подсказку.
        </p>
        {cloudField("Облачный пароль", "password", { type: "password", autoComplete: "new-password", placeholder: "Не короче 6 знаков" })}
        {cloudField("Ещё раз", "repeat", { type: "password", autoComplete: "new-password" })}
        {cloudField("Подсказка (необязательно)", "hint", { type: "text", maxLength: 100, placeholder: "Её видно до входа" })}
        {cloudField("Пароль от аккаунта", "account", { type: "password", autoComplete: "current-password", placeholder: "Чтобы это точно были вы" })}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <Button variant="link" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={busy} onClick={() => void saveCloud()}>
            {busy ? "Сохраняем…" : "Включить"}
          </Button>
        </div>
      </>
    );
  } else if (step === "loading") {
    body = <p className={styles.hint}>Загрузка…</p>;
  } else if (step === "error") {
    body = (
      <>
        <p className={styles.error}>{error}</p>
        <Button variant="link" onClick={onClose}>
          Закрыть
        </Button>
      </>
    );
  } else if (step === "scan") {
    body = (
      <>
        {totp ? (
          <>
            <p className={styles.hint}>
              Отсканируйте код в приложении-аутентификаторе (Google Authenticator, Aegis, 1Password, Bitwarden) и введите шестизначный код из него.
            </p>
            <div className={styles.qr} dangerouslySetInnerHTML={{ __html: prettyQrSvg(totp.uri, { logo: false }) }} />
            <p className={styles.hint}>Не получается отсканировать? Введите ключ вручную:</p>
            <div className={styles.codeRow}>
              <span className={styles.mono}>{totp.secret}</span>
              <button type="button" className={styles.iconButton} title="Скопировать ключ" aria-label="Скопировать ключ" onClick={() => void copy(totp.secret)}>
                <Icon name="Copy" size={16} />
              </button>
            </div>
            {copied ? <p className={styles.hint}>Ключ скопирован ✓</p> : null}
          </>
        ) : (
          <>
            <p className={styles.hint}>Код отправлен в ваш чат с Shalter и придёт уведомлением. Если приложение открыто, код подставится сам. Код действует 5 минут.</p>
            <p className={styles.hint}>Не видите код? Введите в поле номер телефона этого аккаунта — этого достаточно, чтобы включить.</p>
            <Button
              variant="secondary"
              disabled={resending}
              onClick={async () => {
                setResending(true);
                setError(null);
                try {
                  await sendTwoFactorCode();
                } catch (err) {
                  setError(errorText(err, "Не удалось отправить код"));
                }
                setResending(false);
              }}
            >
              {resending ? "Отправляем…" : "Отправить код ещё раз"}
            </Button>
          </>
        )}
        <TextField
          className={styles.codeInput}
          inputMode="numeric"
          placeholder="······"
          maxLength={20}
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(method === "chat" ? e.target.value.replace(/[^\d+]/g, "").slice(0, 20) : e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button disabled={busy} onClick={() => void confirm()}>
          {busy ? "Проверяем…" : "Включить"}
        </Button>
        <Button variant="link" onClick={onClose}>
          Отмена
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <p>✅ Двухфакторная аутентификация включена</p>
        <p className={styles.hint}>
          Сохраните коды восстановления — каждый работает один раз и понадобится, если вы потеряете доступ к аутентификатору. Больше они не покажутся.
        </p>
        <div className={`${styles.recoveryGrid} ${styles.mono}`}>
          {recoveryCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void copy(recoveryCodes.join("\n"))}>
          {copied ? "Скопировано ✓" : "Скопировать все коды"}
        </Button>
        <Button onClick={onClose}>Я сохранил коды</Button>
      </>
    );
  }

  return (
    <Dialog title="Двухфакторная аутентификация" onClose={onClose}>
      {body}
    </Dialog>
  );
}

/** Отключение 2FA: код, код восстановления или облачный пароль — openTwoFactorDisableDialog. */
export function TwoFactorDisableDialog({ method, onDisabled, onClose }: { method: TwoFactorMethod; onDisabled: () => void; onClose: () => void }) {
  const byChat = method === "chat";
  const byPassword = method === "password";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const submit = async (value = code) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await disableTwoFactor(value);
      onDisabled();
      onClose();
    } catch (err) {
      setError(errorText(err, "Неверный код"));
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Код в чат приходит не сам — присылаем его, как только открыли окно.
  const sendCode = () =>
    sendTwoFactorCode().then(
      () => setError(null),
      (err) => setError(errorText(err, "Не удалось отправить код"))
    );
  useEffect(() => {
    if (byChat) void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Как и при включении: код из чата Shalter подставляется и сразу отправляется.
  useWsEvent("message:new", ({ message }) => {
    if (!byChat || message?.senderId !== SHALTER_BOT) return;
    const found = codeFromMessage(message.text);
    if (!found) return;
    setCode(found);
    void submit(found);
  });

  return (
    <Dialog title="Отключить двухфакторную аутентификацию?" onClose={onClose}>
      <form
        className={styles.field}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className={styles.hint}>
          {byPassword
            ? "Введите облачный пароль."
            : byChat
              ? "Мы отправили код в чат «Shalter». Введите его или код восстановления."
              : "Введите текущий код из аутентификатора или код восстановления."}
        </p>
        {byPassword ? (
          <TextField type="password" placeholder="Облачный пароль" autoFocus autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} />
        ) : (
          <TextField className={styles.codeInput} placeholder="······" autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} />
        )}
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" variant="danger" disabled={busy}>
          Отключить
        </Button>
      </form>
      {byChat ? (
        <Button variant="link" onClick={() => void sendCode()}>
          Отправить код ещё раз
        </Button>
      ) : null}
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
