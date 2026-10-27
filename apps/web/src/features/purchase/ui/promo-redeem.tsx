import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { sessionQueries } from "@/entities/session";
import { starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { Button, SettingsSection, TextField } from "@/shared/ui";

import { premiumQueries, redeemPromoCode } from "../api/purchase";

import styles from "./purchase.module.css";

/**
 * «Промокод» в разделе Premium: приз (Premium, звёзды, реклама, бизнес) начисляется сразу.
 * Кнопка зависит от текущего значения поля (в старом клиенте она оставалась выключенной).
 */
export function PromoRedeem() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await redeemPromoCode(value);
      setCode("");
      setResult({ ok: true, text: res.message });
      void client.invalidateQueries({ queryKey: sessionQueries.current().queryKey });
      void client.invalidateQueries({ queryKey: premiumQueries.me().queryKey });
      void client.invalidateQueries({ queryKey: starsQueries.info().queryKey });
    } catch (err) {
      setResult({ ok: false, text: errorText(err, "Не удалось активировать промокод") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="Промокод">
      <form className={styles.pad} onSubmit={(e) => void submit(e)}>
        <TextField
          placeholder="Введите код"
          aria-label="Промокод"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setResult(null);
          }}
        />
        {result ? <p className={result.ok ? styles.promoSuccess : styles.promoError}>{result.text}</p> : null}
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? "Активируем…" : "Активировать"}
        </Button>
      </form>
    </SettingsSection>
  );
}
