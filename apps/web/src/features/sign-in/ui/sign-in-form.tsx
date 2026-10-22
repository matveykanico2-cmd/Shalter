import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { sessionQueries } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button, TextField } from "@/shared/ui";

import { isTwoFactorChallenge, loginByEmail, type TwoFactorChallenge } from "../api/sign-in";

import styles from "./sign-in.module.css";
import { TwoFactorStep } from "./two-factor-step";

type Props = {
  onSignedIn: () => void;
  /** Подсказка над кнопкой, пока нет ошибки (например, «сеанс завершён»). */
  notice?: string;
};

/** Вход по почте и паролю, при включённой 2FA — со вторым шагом. Вошли — сессия перечитывается. */
export function SignInForm({ onSignedIn, notice }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: sessionQueries.baseKey });
    onSignedIn();
  };
  const login = useMutation({
    mutationFn: () => loginByEmail(email.trim(), password),
    onSuccess: (res) => (isTwoFactorChallenge(res) ? setChallenge(res) : finish()),
  });

  if (challenge) return <TwoFactorStep challenge={challenge} onSuccess={finish} onCancel={() => setChallenge(null)} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.title}>Вход в Shalter</p>
      <TextField type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        type="password"
        placeholder="Пароль"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {notice && !login.isError && <p className={styles.hint}>{notice}</p>}
      {login.isError && <p className={styles.error}>{errorText(login.error)}</p>}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
