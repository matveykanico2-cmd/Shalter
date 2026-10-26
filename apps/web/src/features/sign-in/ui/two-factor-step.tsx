import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Button, TextField } from "@/shared/ui";

import {
  cancelDeletion,
  loginByTwoFactor,
  type LoginResult,
  resendTwoFactorCode,
  scheduleDeletion,
  type TwoFactorChallenge,
} from "../api/sign-in";

import styles from "./sign-in.module.css";

type Props = {
  challenge: TwoFactorChallenge;
  onSuccess: (res: LoginResult) => void;
  /** «Отмена» и запрошенное удаление: назад к форме входа, с сообщением для неё. */
  onCancel: (message?: string) => void;
};

/** Второй шаг входа: код из приложения, код из чата Shalter или облачный пароль (renderTwoFactorPanel). */
export function TwoFactorStep({ challenge, onSuccess, onCancel }: Props) {
  const byPassword = challenge.method === "password";
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [deletionAt, setDeletionAt] = useState(challenge.scheduledDeletionAt);
  const login = useMutation({
    mutationFn: () => loginByTwoFactor(challenge.ticket, code),
    onSuccess,
    onError: () => setCode(""),
  });
  const resend = useMutation({
    mutationFn: () => resendTwoFactorCode(challenge.ticket),
    onSuccess: () => setNotice("Новый код отправлен в чат Shalter"),
    onError: (err) => setNotice(errorText(err, "Не удалось отправить код")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    login.mutate();
  };

  const undoDeletion = async () => {
    try {
      await cancelDeletion(challenge.ticket);
      setDeletionAt(null);
      setNotice("Удаление аккаунта отменено.");
    } catch (err) {
      setNotice(errorText(err, "Не удалось отменить удаление"));
    }
  };

  const requestDeletion = async () => {
    const ok = await askConfirm(
      "Не помните облачный пароль и не можете войти?\n\nМожно запросить удаление аккаунта — он будет удалён через 7 дней. Если вспомните пароль и войдёте до этого, удаление отменится.\n\nЗапросить удаление?"
    );
    if (!ok) return;
    try {
      const { deleteAt } = await scheduleDeletion(challenge.ticket);
      const when = new Date(deleteAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      onCancel(`Аккаунт будет удалён ${when}. Войдите до этой даты, чтобы отменить.`);
    } catch (err) {
      setNotice(errorText(err, "Не удалось запросить удаление"));
    }
  };

  const account = challenge.name ? ` ${challenge.name}` : "";

  return (
    <div className={styles.panel}>
      <p className={styles.title}>{byPassword ? "Облачный пароль" : "Двухфакторная аутентификация"}</p>
      <p className={styles.instructions}>
        {byPassword
          ? `Вход в аккаунт${account} защищён облачным паролем — введите его.`
          : `Вход в аккаунт${account} защищён вторым фактором — введите текущий код.`}
      </p>
      <form className={styles.form} onSubmit={submit}>
        <TextField
          className={byPassword ? undefined : styles.code}
          type={byPassword ? "password" : "text"}
          inputMode="text"
          placeholder={byPassword ? "Облачный пароль" : "······"}
          autoComplete={byPassword ? "current-password" : "one-time-code"}
          autoFocus
          value={code}
          onChange={(e) => setCode(byPassword ? e.target.value : e.target.value.trim())}
        />
        <p className={styles.hint}>
          {byPassword
            ? challenge.hint
              ? `Подсказка: ${challenge.hint}`
              : "Это отдельный пароль, который вы задали в настройках безопасности. Он не совпадает с паролем от аккаунта."
            : challenge.method === "chat"
              ? "Код отправлен в ваш чат с Shalter — откройте его на устройстве, где вы уже вошли. Можно ввести и код восстановления."
              : "Код из приложения-аутентификатора. Можно ввести и код восстановления."}
        </p>
        {challenge.method === "chat" && (
          <button type="button" className={styles.link} onClick={() => resend.mutate()} disabled={resend.isPending}>
            Отправить код ещё раз
          </button>
        )}
        {login.isError && !notice && <p className={`${styles.error} ${styles.center}`}>{errorText(login.error)}</p>}
        {notice && <p className={`${styles.error} ${styles.center}`}>{notice}</p>}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? "Проверяем…" : "Подтвердить вход"}
        </Button>
      </form>
      <button type="button" className={styles.link} onClick={() => onCancel()}>
        Отмена
      </button>
      {deletionAt && (
        <button type="button" className={styles.link} onClick={() => void undoDeletion()}>
          Отменить удаление аккаунта
        </button>
      )}
      <button type="button" className={styles.link} onClick={() => void requestDeletion()}>
        Не помню облачный пароль — удалить аккаунт
      </button>
    </div>
  );
}
