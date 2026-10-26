import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, PhoneField, TextField } from "@/shared/ui";

import { checkRecoveryPair, finishPairRecovery, type SignedInUser } from "../api/sign-in";

import styles from "./sign-in.module.css";

type Props = {
  onSignedIn: (user: SignedInUser) => void;
  onBack: () => void;
};

/** «Забыли пароль?» (renderRecoverPanel): почта и телефон аккаунта → код из письма и новый пароль. */
export function RecoverPanel({ onSignedIn, onBack }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const check = useMutation({
    mutationFn: () => checkRecoveryPair(email.trim(), phone),
    onSuccess: () => {
      setCode("");
      setStep("code");
    },
  });
  const reset = useMutation({
    mutationFn: () => finishPairRecovery(email.trim(), phone, code.trim(), password),
    onSuccess: ({ user }) => onSignedIn(user),
  });
  const pending = check.isPending || reset.isPending;
  const error = step === "email" ? check.error : reset.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "email") check.mutate();
    else reset.mutate();
  };

  return (
    <div className={styles.panel}>
      <p className={styles.title}>Забыли пароль?</p>
      <p className={styles.instructions}>
        {step === "email"
          ? "Введите адрес почты и номер телефона этого аккаунта."
          : "Мы отправили код на вашу почту. Введите его и придумайте новый пароль."}
      </p>
      <form className={styles.form} onSubmit={submit}>
        {step === "email" ? (
          <>
            <TextField type="email" placeholder="you@example.com" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <PhoneField initial={phone} onChange={setPhone} />
            <p className={styles.hint}>Адрес почты и номер телефона — оба как указаны в аккаунте. На почту придёт код подтверждения.</p>
          </>
        ) : (
          <>
            <TextField
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Код из письма"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <TextField type="password" placeholder="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className={styles.hint}>Все остальные сеансы будут завершены, а владельцу уйдёт уведомление в чат и на почту.</p>
          </>
        )}
        {error && <p className={`${styles.error} ${styles.center}`}>{errorText(error)}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Секунду…" : step === "email" ? "Далее" : "Задать новый пароль"}
        </Button>
      </form>
      {step === "code" && (
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            reset.reset();
            setStep("email");
          }}
        >
          Изменить данные
        </button>
      )}
      <button type="button" className={styles.link} onClick={onBack}>
        Назад ко входу
      </button>
    </div>
  );
}
