import { useEffect, useRef, useState } from "react";

import { TextField } from "@/shared/ui";

import { checkUsername } from "../api/sign-in";

import styles from "./sign-in.module.css";

type Status = { text: string; kind?: "ok" | "taken" };

/** Юзернейм при регистрации: только латиница, цифры и _, проверка «Свободен ✓» через 0,4 с после ввода. */
export function UsernameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const asked = useRef("");

  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (raw: string) => {
    const cleaned = raw
      .replace(/^@+/, "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 32);
    onChange(cleaned);
    clearTimeout(timer.current);
    asked.current = cleaned;
    if (cleaned.length < 3) {
      setStatus(cleaned.length === 0 ? null : { text: "Минимум 3 символа" });
      return;
    }
    setStatus({ text: "Проверяем…" });
    timer.current = setTimeout(() => {
      checkUsername(cleaned).then(
        (res) => {
          // Пока ждали ответ, имя успели поменять — этот ответ уже ни к чему.
          if (asked.current !== cleaned) return;
          setStatus(res.available ? { text: "Свободен ✓", kind: "ok" } : { text: res.error || "Занят", kind: "taken" });
        },
        () => asked.current === cleaned && setStatus({ text: "Не удалось проверить — попробуем при регистрации" })
      );
    }, 400);
  };

  return (
    <div className={styles.usernameField}>
      <TextField
        className={styles.mono}
        placeholder="юзернейм"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="username"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
      <p className={status?.kind ? `${styles.hint} ${styles[status.kind]}` : styles.hint}>
        {status ? status.text : "По нему вас смогут найти и добавить — латиница, цифры и _"}
      </p>
    </div>
  );
}
