import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { settingsQueries, useSettings } from "@/entities/settings";

import { copyText } from "@/shared/lib/clipboard";
import { Button, Dialog, Icon, Menu } from "@/shared/ui";

import { saveTranslateLanguage } from "../api/message-actions";
import { languageOf, translate, TRANSLATE_LANGUAGES, type Translation } from "../lib/translate";

import styles from "./message-actions.module.css";

type Result = { lang: string; value: Translation | null; failed: boolean };

/**
 * «Перевод» — как public/js/components/translatePopup.js (popups/translate в tweb): свёрнутый
 * оригинал «Перевод с …», под чертой «Перевод на <язык>» с копированием; язык — в заголовке,
 * выбор запоминается в настройках.
 */
export function TranslateDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const client = useQueryClient();
  const saved = useSettings().data?.translateLanguage;
  const [chosen, setChosen] = useState<string | null>(null);
  const lang = chosen ?? (saved || "ru");
  const [result, setResult] = useState<Result | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    translate(text, lang).then(
      (value) => {
        if (!alive) return;
        if (value.detected) setDetected(value.detected);
        setResult({ lang, value, failed: false });
      },
      () => alive && setResult({ lang, value: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [text, lang]);

  const pick = (id: string) => {
    setChosen(id);
    client.setQueryData(settingsQueries.current().queryKey, (s) => (s ? { ...s, translateLanguage: id } : s));
    saveTranslateLanguage(id).catch(() => {});
  };

  const target = languageOf(lang);
  const from = languageOf(detected);
  const ready = result?.lang === lang ? result : null;
  const sameLanguage = !!ready?.value?.detected && languageOf(ready.value.detected)?.id === target?.id;

  return (
    <Dialog title="Перевод" onClose={onClose} className={styles.translate}>
      <div className={styles.translateCard}>
        <div className={expanded ? styles.original : `${styles.original} ${styles.collapsed}`}>
          <button type="button" className={styles.originalHead} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span>{from ? `Перевод с ${from.from}` : "Оригинал"}</span>
            <span className={expanded ? `${styles.arrow} ${styles.toggled}` : styles.arrow}>
              <Icon name="ChevronDown" size={18} />
            </span>
          </button>
          <div className={styles.originalText} dir="auto">
            {text}
          </div>
        </div>
        <div className={styles.translateResult}>
          <div className={styles.resultHead}>
            <span className={styles.resultTitle}>
              Перевод на{" "}
              <button
                type="button"
                className={styles.lang}
                aria-label="Язык перевода"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setPicker({ x: r.left, y: r.bottom + 4 });
                }}
              >
                {target?.to ?? lang}
                <Icon name="ChevronDown" size={14} />
              </button>
            </span>
            {ready?.value && !sameLanguage ? (
              <button type="button" className={styles.copy} title="Копировать" onClick={() => void copyText(ready.value?.text ?? "", "Перевод скопирован")}>
                <Icon name="Copy" size={18} />
              </button>
            ) : null}
          </div>
          <div className={styles.resultText} dir="auto" aria-live="polite">
            {!ready ? (
              <div className={styles.skeleton} aria-label="Переводим" />
            ) : ready.failed ? (
              <span className={styles.error}>Не удалось перевести. Попробуйте другой язык или позже.</span>
            ) : sameLanguage ? (
              "Сообщение уже на этом языке."
            ) : (
              ready.value?.text
            )}
          </div>
        </div>
      </div>
      <Button onClick={onClose}>OK</Button>
      {picker ? (
        <Menu
          at={picker}
          label="Язык перевода"
          items={TRANSLATE_LANGUAGES.map((l) => ({ label: l.label, icon: l.id === lang ? "Check" : undefined, onClick: () => pick(l.id) }))}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </Dialog>
  );
}
