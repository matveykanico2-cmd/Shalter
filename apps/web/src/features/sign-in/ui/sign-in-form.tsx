import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { loginWithPasskey, NO_PASSKEY_HINT, passkeyLoginErrorText, passkeysSupported } from "@/shared/lib/passkey";
import { isInstalledApp } from "@/shared/lib/platform";
import { Button, DateField, Icon, PhoneField, TextField, toast } from "@/shared/ui";

import {
  isTwoFactorChallenge,
  loginAsGuest,
  loginByEmail,
  type LoginResult,
  register,
  type SignedInUser,
  type TwoFactorChallenge,
  uploadAvatar,
} from "../api/sign-in";
import { playWelcome } from "../lib/welcome";

import { CodePanel } from "./code-panel";
import { QrPanel } from "./qr-panel";
import { RecoverPanel } from "./recover-panel";
import styles from "./sign-in.module.css";
import { TwoFactorStep } from "./two-factor-step";
import { UsernameInput } from "./username-input";

export type SignInMode = "login" | "register" | "qr" | "code" | "recover";

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
      onRegistered={(user) => void finish(user)}
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
  onRegistered: (user: SignedInUser) => void;
};

/** Вход или регистрация по почте и паролю — основная карточка экрана входа. */
function EmailForm({ register: isRegister, notice, message, embedded, onToggle, onMode, onResult, onRegistered }: EmailFormProps) {
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(message);
  const [pending, setPending] = useState(false);
  const [guestPending, setGuestPending] = useState(false);

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
    void run(async () => {
      if (!isRegister) return onResult(await loginByEmail(email.trim(), password));
      const { user } = await register({ name, lastName, email, phone, username, password, birthday: birthday || null });
      if (avatar) await uploadAvatar(user.id, avatar);
      onRegistered(user);
    });
  };

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
      {isRegister && (
        <>
          <AvatarPicker image={avatar} onPick={setAvatar} />
          <TextField placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField placeholder="Фамилия (необязательно)" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </>
      )}
      <TextField type="email" placeholder="you@example.com" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      {isRegister && (
        <>
          <PhoneField initial={phone} onChange={setPhone} />
          <DateField
            value={birthday}
            aria-label="Дата рождения"
            onChange={(iso, err) => {
              setBirthday(iso);
              setBirthdayError(err);
            }}
          />
          {birthdayError && <p className={styles.error}>{birthdayError}</p>}
          <UsernameInput value={username} onChange={setUsername} />
        </>
      )}
      <TextField
        type="password"
        placeholder="Пароль"
        autoComplete={isRegister ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {isRegister && (
        <>
          <p className={styles.hint}>Пароль — не короче 6 символов, хранится только в виде хеша.</p>
          <p className={styles.hint}>Дата рождения — необязательно, но друзья смогут поздравлять и предлагать подарки.</p>
        </>
      )}
      {notice && !isRegister && !error && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Проверка…" : isRegister ? "Создать аккаунт" : "Войти"}
      </Button>
      <button type="button" className={styles.link} onClick={onToggle}>
        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
      </button>
      {!isRegister && !embedded && (
        <div className={styles.altMethods}>
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
          <button type="button" className={`${styles.link} ${styles.muted}`} onClick={() => onMode("recover")}>
            Забыли пароль?
          </button>
          <Button
            variant="secondary"
            disabled={pending || guestPending}
            onClick={() => void run(async () => onResult(await loginAsGuest()), setGuestPending)}
          >
            {guestPending ? "Входим…" : "Продолжить как гость"}
          </Button>
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

/** «Фото профиля (необязательно)» при регистрации: уменьшенная картинка уйдёт после входа. */
function AvatarPicker({ image, onPick }: { image: string | null; onPick: (dataUrl: string) => void }) {
  return (
    <label className={styles.avatarButton}>
      <span className={styles.avatarPreview}>{image ? <img src={image} alt="" /> : <Icon name="Users" size={22} />}</span>
      <input
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) fileToImageDataUrl(file, 256).then(onPick, () => toast("Не удалось прочитать изображение", { error: true }));
        }}
      />
      <span className={styles.avatarLabel}>Фото профиля (необязательно)</span>
    </label>
  );
}
