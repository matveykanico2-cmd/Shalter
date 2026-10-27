import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, PhoneField, TextField } from "@/shared/ui";

import { isTwoFactorChallenge, type LoginResult, startCodeLogin, type TwoFactorChallenge, verifyCodeLogin } from "../api/sign-in";

import styles from "./sign-in.module.css";

type Props = {
  onSignedIn: (res: LoginResult) => void;
  onChallenge: (challenge: TwoFactorChallenge) => void;
  onBack: () => void;
};

/** Вход по коду из сообщения Shalter на другом устройстве (renderCodePanel): телефон → код. */
export function CodePanel({ onSignedIn, onChallenge, onBack }: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const send = useMutation({ mutationFn: () => startCodeLogin(phone), onSuccess: () => setStep("code") });
  const verify = useMutation({
    mutationFn: () => verifyCodeLogin(phone, code),
    onSuccess: (res) => (isTwoFactorChallenge(res) ? onChallenge(res) : onSignedIn(res)),
  });
  const pending = send.isPending || verify.isPending;
  const error = step === "phone" ? send.error : verify.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "phone") send.mutate();
    else verify.mutate();
  };

  return (
    <div className={styles.panel}>
      <p className={styles.title}>Вход по коду</p>
      <form className={styles.form} onSubmit={submit}>
        {step === "phone" ? (
          <>
            <PhoneField initial={phone} autoFocus onChange={setPhone} />
            <p className={styles.hint}>Код придёт сообщением от Shalter на другое устройство, где вы уже вошли в этот аккаунт.</p>
          </>
        ) : (
          <>
            <TextField
              className={styles.code}
              inputMode="numeric"
              placeholder="······"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p className={styles.hint}>Код отправлен в чат Shalter для номера {phone}.</p>
          </>
        )}
        {error && <p className={`${styles.error} ${styles.center}`}>{errorText(error)}</p>}
        <Button type="submit" disabled={pending}>
          {step === "phone" ? (pending ? "Отправляем…" : "Отправить код") : pending ? "Проверяем…" : "Войти"}
        </Button>
      </form>
      <button type="button" className={styles.link} onClick={onBack}>
        Войти по email
      </button>
    </div>
  );
}
