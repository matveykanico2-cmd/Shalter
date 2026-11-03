import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { loginWithPasskey, NO_PASSKEY_HINT, passkeyLoginErrorText, passkeysSupported } from "@/shared/lib/passkey";
import { isInstalledApp } from "@/shared/lib/platform";
import { Button, Icon, TextField, toast } from "@/shared/ui";

import {
  isTwoFactorChallenge,
  loginAsGuest,
  loginByEmail,
  type LoginResult,
  register,
  type SignedInUser,
  type TwoFactorChallenge,
} from "../api/sign-in";
import { playWelcome } from "../lib/welcome";

import { CodePanel } from "./code-panel";
import { ProfileSetup } from "./profile-setup";
import { QrPanel } from "./qr-panel";
import { RecoverPanel } from "./recover-panel";
import styles from "./sign-in.module.css";
import { TwoFactorStep } from "./two-factor-step";

export type SignInMode = "login" | "register" | "setup" | "qr" | "code" | "recover";

type Props = {
  onSignedIn: (user: SignedInUser) => void;
  /** Подсказка над кнопкой, пока нет ошибки (например, «сеанс завершён»). */
  notice?: string;
  /** Внутри чужого экрана (QR-подтверждение, OAuth): только почта и пароль, без ссылки на загрузку. */
  embedded?: boolean;
  onModeChange?: (mode: SignInMode) => void;
};

/**
 * Экран входа как public/js/views/login.js: вход и регистрация по почте, вход по QR, по ключу
 * доступа и по коду из сообщения, восстановление пароля и второй шаг (2FA, облачный пароль).
 * Вошли — сессия перечитывается, дальше решает onSignedIn.
 */
export function SignInForm({ onSignedIn, notice, embedded, onModeChange }: Props) {
  const queryClient = useQueryClient();
  const [mode, setModeState] = useState<SignInMode>("login");
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  // Сообщение для формы входа после другого шага (удаление аккаунта запрошено и т. п.).
  const [message, setMessage] = useState<string | null>(null);
  // Только что зарегистрировались: второй шаг — данные профиля.
  const [created, setCreated] = useState<{ user: SignedInUser; password: string } | null>(null);

  const setMode = (next: SignInMode) => {
    setModeState(next);
    setMessage(null);
    onModeChange?.(next);
  };
  const finish = useCallback(
    async (user: SignedInUser) => {
      // Приветствие играет, пока перечитывается сессия; внутри чужого экрана (QR, OAuth) — без него.
      await Promise.all([queryClient.invalidateQueries({ queryKey: sessionQueries.baseKey }), embedded ? null : playWelcome()]);
      onSignedIn(user);
    },
    [queryClient, onSignedIn, embedded]
  );
  const onResult = (res: LoginResult | TwoFactorChallenge) => (isTwoFactorChallenge(res) ? setChallenge(res) : void finish(res.user));
  const back = () => setMode("login");

  if (challenge) {
    return (
      <TwoFactorStep
        challenge={challenge}
        onSuccess={(res) => void finish(res.user)}
        onCancel={(msg) => {
          setChallenge(null);
          setMode("login");
          if (msg) setMessage(msg);
        }}
      />
    );
  }
  if (created) return <ProfileSetup user={created.user} password={created.password} onDone={(user) => void finish(user)} />;
  if (mode === "qr") return <QrPanel onSignedIn={(user) => void finish(user)} onBack={back} />;
  if (mode === "code") return <CodePanel onSignedIn={onResult} onChallenge={setChallenge} onBack={back} />;
  if (mode === "recover") return <RecoverPanel onSignedIn={(user) => void finish(user)} onBack={back} />;
  return (
    <EmailForm
      register={mode === "register"}
      notice={notice}
      message={message}
      embedded={embedded}
      onToggle={() => setMode(mode === "login" ? "register" : "login")}
      onMode={setMode}
      onResult={onResult}
      onRegistered={(user, password) => {
        setCreated({ user, password });
        setModeState("setup");
        onModeChange?.("setup");
      }}
    />
  );
}

type EmailFormProps = {
  register: boolean;
  notice?: string;
  message: string | null;
  embedded?: boolean;
  onToggle: () => void;
  onMode: (mode: SignInMode) => void;
  onResult: (res: LoginResult | TwoFactorChallenge) => void;
  onRegistered: (user: SignedInUser, password: string) => void;
};

/**
 * Вход или регистрация по почте и паролю — основная карточка экрана входа. Регистрация — те же
 * два поля, остальное спрашиваем после. Остальные способы входа (QR, ключ доступа, код, гость) —
 * под «Другие способы входа», чтобы не загромождать карточку.
 */
function EmailForm({ register: isRegister, notice, message, embedded, onToggle, onMode, onResult, onRegistered }: EmailFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(message);
  const [pending, setPending] = useState(false);
  const [more, setMore] = useState(false);
  const [guestPending, setGuestPending] = useState(false);
  const [guestName, setGuestName] = useState("");

  const run = async (action: () => Promise<void>, setBusy = setPending) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Пустые поля — подсказка сразу, без запроса (раньше пустой вход отвечал «Неверный email или пароль»).
    const missing = !email.trim() ? "Введите email" : !password ? "Введите пароль" : isRegister && password.length < 6 ? "Пароль должен быть не короче 6 символов" : null;
    if (missing) return setError(missing);
    void run(async () => {
      if (!isRegister) return onResult(await loginByEmail(email.trim(), password));
      const { user } = await register(email.trim(), password);
      onRegistered(user, password);
    });
  };

  const guest = () => void run(async () => onResult(await loginAsGuest(guestName)), setGuestPending);

  const passkey = () =>
    void run(async () => {
      try {
        onResult(await loginWithPasskey());
      } catch (err) {
        if (err instanceof Error && err.name === "NotAllowedError") toast(NO_PASSKEY_HINT, { durationMs: 10_000 });
        throw new Error(passkeyLoginErrorText(err), { cause: err });
      }
    });

  return (
    <form className={styles.form} onSubmit={submit}>
      <TextField type="email" placeholder="you@example.com" aria-label="Почта" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        type="password"
        placeholder="Пароль"
        aria-label="Пароль"
        autoComplete={isRegister ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {isRegister && <p className={styles.hint}>Не короче 6 символов. Имя, фото и юзернейм — на следующем шаге.</p>}
      {notice && !isRegister && !error && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Проверка…" : isRegister ? "Создать аккаунт" : "Войти"}
      </Button>
      {!isRegister && !embedded && (
        <button type="button" className={`${styles.link} ${styles.muted}`} onClick={() => onMode("recover")}>
          Забыли пароль?
        </button>
      )}
      <button type="button" className={styles.link} onClick={onToggle}>
        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
      </button>
      {!isRegister && !embedded && (
        <div className={styles.altMethods}>
          <button type="button" className={`${styles.link} ${styles.entry}`} aria-expanded={more} onClick={() => setMore((v) => !v)}>
            Другие способы входа
            <span className={more ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}>
              <Icon name="ChevronDown" size={15} />
            </span>
          </button>
          {more && (
            <>
              <button type="button" className={`${styles.link} ${styles.entry}`} onClick={() => onMode("qr")}>
                <Icon name="Qrcode" size={15} /> Войти по QR-коду
              </button>
              {passkeysSupported() && (
                <button type="button" className={`${styles.link} ${styles.entry}`} disabled={pending} onClick={passkey}>
                  <Icon name="Lock" size={15} /> Войти по ключу доступа
                </button>
              )}
              <button type="button" className={`${styles.link} ${styles.entry}`} onClick={() => onMode("code")}>
                <Icon name="MessageCircle" size={15} /> Войти по коду из сообщения
              </button>
              <div className={styles.guest}>
                <TextField
                  placeholder="Имя гостя (необязательно)"
                  aria-label="Имя гостя"
                  maxLength={64}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!pending && !guestPending) guest();
                  }}
                />
                <Button variant="secondary" disabled={pending || guestPending} onClick={guest}>
                  {guestPending ? "Входим…" : "Продолжить как гость"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {!embedded && !isInstalledApp() && (
        <a className={`${styles.link} ${styles.muted}`} href="/download">
          Скачать приложение для Windows, Linux и Android
        </a>
      )}
    </form>
  );
}
