import { type FormEvent, useState } from "react";

import { hasPasscode, removePasscode, setPasscode, verifyPasscode } from "@/shared/lib/passcode";
import { Button, Dialog, TextField } from "@/shared/ui";

import styles from "./privacy.module.css";

type Step = "current" | "new" | "confirm";

const PROMPTS: Record<Step, string> = {
  current: "Введите текущий код-пароль",
  new: "Придумайте код-пароль (минимум 4 цифры)",
  confirm: "Повторите код-пароль",
};

/** Задать или сменить код-пароль этого устройства — openSetPasscodeDialog (components/passcodeDialog.js). */
export function SetPasscodeDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>(() => (hasPasscode() ? "current" : "new"));
  const [value, setValue] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (to: Step) => {
    setStep(to);
    setValue("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === "current") {
      setBusy(true);
      setError(null);
      const ok = await verifyPasscode(value);
      setBusy(false);
      if (!ok) return setError("Неверный код-пароль");
      return go("new");
    }
    if (step === "new") {
      if (value.length < 4) return setError("Минимум 4 цифры");
      setError(null);
      setNext(value);
      return go("confirm");
    }
    if (value !== next) {
      setError("Коды не совпадают, попробуйте снова");
      setNext("");
      return go("new");
    }
    await setPasscode(next);
    onClose();
    onDone();
  };

  return (
    <Dialog title="Код-пароль" onClose={onClose}>
      <form className={styles.field} onSubmit={(e) => void submit(e)}>
        <p className={styles.hint}>{PROMPTS[step]}</p>
        {/* key — новое поле на каждом шаге, чтобы автофокус сработал снова. */}
        <TextField key={step} type="password" inputMode="numeric" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {step === "confirm" ? "Сохранить" : "Далее"}
        </Button>
      </form>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}

/** Отключить код-пароль: сначала текущий код — openRemovePasscodeDialog. */
export function RemovePasscodeDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await verifyPasscode(code);
    setBusy(false);
    if (!ok) return setError("Неверный код-пароль");
    removePasscode();
    onClose();
    onDone();
  };

  return (
    <Dialog title="Отключить код-пароль" onClose={onClose}>
      <form className={styles.field} onSubmit={(e) => void submit(e)}>
        <p className={styles.hint}>Введите текущий код-пароль для подтверждения</p>
        <TextField type="password" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        {error ? <p className={styles.error}>{error}</p> : null}
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? "Проверяем…" : "Отключить"}
        </Button>
      </form>
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
