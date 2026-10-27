import { type FormEvent, useState } from "react";

import { http } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { Button, TextField } from "@/shared/ui";

import styles from "./lock-screen.module.css";

/** «Пароль при запуске» (public/js/components/passwordLockScreen.js): пароль от аккаунта проверяет сервер. */
export function PasswordLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await http.post("/api/auth/verify-password", { password });
      onUnlock();
    } catch (err) {
      setError(errorText(err, "Неверный пароль"));
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={(e) => void submit(e)}>
        <p className={styles.title}>Введите пароль</p>
        <p className={styles.hint}>Приложение защищено паролем от аккаунта</p>
        <TextField type="password" placeholder="Пароль" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" className={styles.submit} disabled={busy}>
          {busy ? "Проверяем…" : "Войти"}
        </Button>
      </form>
    </div>
  );
}
