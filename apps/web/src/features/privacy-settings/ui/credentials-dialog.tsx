import { type FormEvent, type ReactNode, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, TextField } from "@/shared/ui";

import { changePassword, confirmEmailChange, startEmailChange } from "../api/privacy-settings";

import styles from "./privacy.module.css";

type FormProps = {
  title: string;
  hint: string;
  submitLabel: string;
  children: ReactNode;
  /** Текст ошибки — показать в окне; ничего — готово. */
  onSubmit: () => Promise<string | void>;
  onClose: () => void;
};

/** Окно с полями и одной кнопкой — overlayWith в components/credentialsDialog.js. */
function CredentialsForm({ title, hint, submitLabel, children, onSubmit, onClose }: FormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await onSubmit();
      if (problem) setError(problem);
    } catch (err) {
      setError(errorText(err, "Не получилось"));
    }
    setBusy(false);
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form className={styles.field} onSubmit={(e) => void submit(e)}>
        <p className={styles.hint}>{hint}</p>
        {children}
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Секунду…" : submitLabel}
        </Button>
      </form>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}

/** «Смена пароля» — openChangePasswordDialog: остальные сеансы сервер завершает сам. */
export function ChangePasswordDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  return (
    <CredentialsForm
      title="Смена пароля"
      hint="Остальные сеансы будут завершены — на других устройствах придётся войти заново."
      submitLabel="Сменить пароль"
      onClose={onClose}
      onSubmit={async () => {
        if (next.length < 6) return "Новый пароль — не короче 6 символов";
        if (next !== repeat) return "Пароли не совпадают";
        await changePassword(current, next);
        onClose();
        onDone();
      }}
    >
      <TextField type="password" placeholder="Текущий пароль" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
      <TextField type="password" placeholder="Новый пароль" value={next} onChange={(e) => setNext(e.target.value)} />
      <TextField type="password" placeholder="Ещё раз новый пароль" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
    </CredentialsForm>
  );
}

/**
 * «Смена почты» — openChangeEmailDialog: пароль и новый адрес, затем код из письма
 * на новый адрес (openConfirmEmailDialog). onDone — с новой почтой.
 */
export function ChangeEmailDialog({ currentEmail, onDone, onClose }: { currentEmail?: string; onDone: (email: string | undefined) => void; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <CredentialsForm
        key="confirm"
        title="Подтвердите почту"
        hint={`Мы отправили код на ${sentTo}. Письмо может идти пару минут — проверьте и папку «Спам».`}
        submitLabel="Сменить почту"
        onClose={onClose}
        onSubmit={async () => {
          const value = code.trim();
          if (!/^\d{6}$/.test(value)) return "Введите шестизначный код из письма";
          const { user } = await confirmEmailChange(value);
          onClose();
          onDone(user?.email);
        }}
      >
        <TextField
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="Код из письма"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </CredentialsForm>
    );
  }
  return (
    <CredentialsForm
      key="start"
      title="Смена почты"
      hint={
        currentEmail
          ? `Сейчас: ${currentEmail}. Проверьте новый адрес: на него будет приходить восстановление доступа.`
          : "Проверьте адрес: на него будет приходить восстановление доступа."
      }
      submitLabel="Получить код"
      onClose={onClose}
      onSubmit={async () => {
        const address = email.trim();
        if (!address.includes("@")) return "Введите адрес почты";
        const res = await startEmailChange(password, address);
        setSentTo(res.email ?? address);
      }}
    >
      <TextField type="password" placeholder="Пароль" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextField type="email" placeholder="Новый адрес почты" value={email} onChange={(e) => setEmail(e.target.value)} />
    </CredentialsForm>
  );
}

/** «Удалить аккаунт» с паролем — openDeleteAccountDialog в views/settings/index.js. */
export function DeleteAccountDialog({ onConfirm, onClose }: { onConfirm: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onConfirm(password);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось удалить аккаунт"));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Удалить аккаунт" onClose={onClose}>
      <form className={styles.field} onSubmit={(e) => void submit(e)}>
        <p className={styles.hint}>Это действие необратимо. Все ваши чаты, боты и данные будут удалены навсегда. Введите пароль для подтверждения.</p>
        <TextField type="password" placeholder="Пароль" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? "Удаляем…" : "Удалить безвозвратно"}
        </Button>
      </form>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
