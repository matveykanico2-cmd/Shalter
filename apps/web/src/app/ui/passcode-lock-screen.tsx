import { type FormEvent, useEffect, useRef, useState } from "react";

import { hasBiometric, unlockBiometric } from "@/shared/lib/biometric";
import { verifyPasscode } from "@/shared/lib/passcode";
import { isInstalledApp } from "@/shared/lib/platform";
import { Button, TextField } from "@/shared/ui";

import styles from "./lock-screen.module.css";

/**
 * Экран код-пароля этого устройства (public/js/components/passcodeLockScreen.js). В приложении
 * с включённой биометрией сразу предлагает Face ID / отпечаток.
 */
export function PasscodeLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [biometric] = useState(() => isInstalledApp() && hasBiometric());
  // С биометрией системное окно Face ID / отпечатка открывается сразу.
  const [checking, setChecking] = useState(biometric);
  const unlockRef = useRef(onUnlock);
  useEffect(() => {
    unlockRef.current = onUnlock;
  });

  const tryBiometric = async () => {
    setError(null);
    setChecking(true);
    if (await unlockBiometric()) return onUnlock();
    setChecking(false);
    setError("Не удалось подтвердить — введите код-пароль");
  };

  useEffect(() => {
    if (!biometric) return;
    let alive = true;
    void unlockBiometric().then((ok) => {
      if (!alive) return;
      if (ok) return unlockRef.current();
      setChecking(false);
      setError("Не удалось подтвердить — введите код-пароль");
    });
    return () => {
      alive = false;
    };
  }, [biometric]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setChecking(true);
    if (await verifyPasscode(code)) return onUnlock();
    setError("Неверный код-пароль");
    setCode("");
    setChecking(false);
  };

  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={(e) => void submit(e)}>
        <span className={styles.icon} aria-hidden="true">
          🔒
        </span>
        <p className={styles.title}>Shalter заблокирован</p>
        <TextField
          className={styles.input}
          type="password"
          inputMode="numeric"
          placeholder="Код-пароль"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" className={styles.submit} disabled={checking}>
          {checking ? "Проверяем…" : "Разблокировать"}
        </Button>
        {biometric && (
          <button type="button" className={styles.biometric} disabled={checking} onClick={() => void tryBiometric()}>
            🔓 Face ID / отпечаток
          </button>
        )}
      </form>
    </div>
  );
}
