import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, TextField } from "@/shared/ui";

import styles from "./sections/sections.module.css";

/** «Смена номера» — askPasswordForPhoneChange (public/js/components/credentialsDialog.js). */
export function PhonePasswordDialog({ onSubmit, onClose }: { onSubmit: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (!password) return setError("Введите пароль");
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(errorText(err, "Не получилось"));
      setBusy(false);
    }
  };

  return (
    <Dialog title="Смена номера" onClose={onClose}>
      <p className={styles.hint}>Чтобы сменить номер телефона, введите пароль от аккаунта.</p>
      <TextField
        type="password"
        placeholder="Пароль"
        aria-label="Пароль"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
      <Button disabled={busy} onClick={() => void submit()}>
        {busy ? "Секунду…" : "Сменить номер"}
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
