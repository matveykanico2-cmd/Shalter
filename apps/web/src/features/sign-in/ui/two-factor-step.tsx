import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, TextField } from "@/shared/ui";

import { loginByTwoFactor, type LoginResult, resendTwoFactorCode, type TwoFactorChallenge } from "../api/sign-in";

import styles from "./sign-in.module.css";

type Props = {
  challenge: TwoFactorChallenge;
  onSuccess: (res: LoginResult) => void;
  onCancel: () => void;
};

/** Второй шаг входа: код из приложения, код из чата Shalter или облачный пароль. */
export function TwoFactorStep({ challenge, onSuccess, onCancel }: Props) {
  const byPassword = challenge.method === "password";
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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
  const account = challenge.name ? ` ${challenge.name}` : "";

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.title}>{byPassword ? "Облачный пароль" : "Двухфакторная аутентификация"}</p>
      <p className={styles.hint}>
        {byPassword
          ? `Вход в аккаунт${account} защищён облачным паролем — введите его.`
          : `Вход в аккаунт${account} защищён вторым фактором — введите текущий код.`}
      </p>
      <TextField
        className={byPassword ? undefined : styles.code}
        type={byPassword ? "password" : "text"}
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
        <Button variant="link" onClick={() => resend.mutate()} disabled={resend.isPending}>
          Отправить код ещё раз
        </Button>
      )}
      {login.isError && <p className={styles.error}>{errorText(login.error)}</p>}
      {notice && <p className={styles.error}>{notice}</p>}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "Проверяем…" : "Подтвердить вход"}
      </Button>
      <Button variant="link" onClick={onCancel}>
        Отмена
      </Button>
    </form>
  );
}
