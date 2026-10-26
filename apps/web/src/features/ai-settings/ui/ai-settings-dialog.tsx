import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, toast } from "@/shared/ui";

import { type AiSettings, aiSettingsQueries, type AiState, updateAiSettings } from "../api/ai-settings";

import styles from "./ai-settings.module.css";

const LABELS = {
  mode: { fast: ["⚡ Быстрый", "Один запрос, ответ за секунды"], smart: ["🧠 Умный", "Длинная память, ответы без обрыва"] },
  length: { short: "Коротко", normal: "Обычно", long: "Подробно" },
  tone: { friendly: "😊 Дружелюбно", business: "💼 Деловой", fun: "😄 Весело", simple: "🧸 Просто" },
  language: { auto: "Как пишу я", ru: "Русский", en: "English" },
} as const;

const creativityLabel = (v: number) => (v < 0.3 ? "точно" : v > 0.8 ? "фантазия" : "сбалансированно");

/**
 * Shalter AI: тариф с расходом за сегодня и «крутилки» ответов (public/js/components/aiSettingsDialog.js).
 * Каждое изменение сохраняется сразу — кнопки «Сохранить» нет, как в настройках Telegram.
 */
export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(aiSettingsQueries.current());
  const key = aiSettingsQueries.current().queryKey;
  const pending = useRef<Partial<AiSettings>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Сразу в кэш, на сервер — пачкой: ползунок и текст — через 0,4 с, кнопки — сразу.
  const save = (patch: Partial<AiSettings>, now = false) => {
    client.setQueryData<AiState>(key, (s) => (s ? { ...s, settings: { ...s.settings, ...patch } } : s));
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    const run = () => {
      const send = pending.current;
      pending.current = {};
      updateAiSettings(send).then(
        (state) => client.setQueryData(key, state),
        (err: unknown) => {
          toast(errorText(err, "Не удалось сохранить"), { error: true });
          void client.invalidateQueries({ queryKey: key });
        }
      );
    };
    if (now) run();
    else timer.current = setTimeout(run, 400);
  };

  const state = query.data;
  return (
    <Dialog title="Shalter AI" onClose={onClose} className={styles.dialog}>
      <div className={styles.body}>
        {!state ? (
          <p className={styles.hint}>{query.isError ? errorText(query.error, "Не удалось загрузить настройки") : "Загружаем…"}</p>
        ) : (
          <Content
            state={state}
            onSave={save}
            onPremium={() => {
              onClose();
              void navigate("/settings/premium");
            }}
          />
        )}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Готово
      </Button>
    </Dialog>
  );
}

type ContentProps = { state: AiState; onSave: (patch: Partial<AiSettings>, now?: boolean) => void; onPremium: () => void };

function Content({ state, onSave, onPremium }: ContentProps) {
  const s = state.settings;
  const smartLocked = !state.plan.modes.includes("smart");

  const segmented = <K extends keyof typeof LABELS>(key: K, options: readonly (keyof (typeof LABELS)[K] & string)[], wide = false) => (
    <div className={wide || options.length === 4 ? `${styles.seg} ${styles.wide}` : styles.seg}>
      {options.map((v) => {
        const label = (LABELS[key] as Record<string, string | readonly [string, string]>)[v];
        const active = (s[key] as string) === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            className={[styles.segButton, active ? styles.active : "", key === "mode" && v === "smart" && smartLocked ? styles.locked : ""].join(" ")}
            onClick={() => !active && onSave({ [key]: v } as Partial<AiSettings>, true)}
          >
            {Array.isArray(label) ? (
              <>
                <b>{label[0]}</b>
                <small>{label[1]}</small>
              </>
            ) : (
              label
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <section className={styles.section}>
        <h3>Тариф и лимиты на сегодня</h3>
        <Usage used={state.usage.texts} max={state.plan.textsPerDay} label="Ответы" />
        <Usage used={state.usage.images} max={state.plan.imagesPerDay} label="Картинки" />
        <div className={styles.plans}>
          {state.plans.map((p) => {
            const current = p.id === state.plan.id;
            return (
              <div key={p.id} className={current ? `${styles.plan} ${styles.current}` : styles.plan}>
                <div className={styles.planHead}>
                  <b>{p.id === "premium" ? `⭐ ${p.name}` : p.name}</b>
                  {current && <span className={styles.badge}>Ваш тариф</span>}
                </div>
                <ul className={styles.perks}>
                  {p.perks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                {!current && p.id === "premium" && (
                  <Button className={styles.planButton} onClick={onPremium}>
                    Подключить Premium
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className={styles.section}>
        <h3>Режим</h3>
        {segmented("mode", ["fast", "smart"], true)}
        {smartLocked && <p className={styles.hint}>🔒 Умный режим — в Premium.</p>}
      </section>
      <section className={styles.section}>
        <h3>Длина ответов</h3>
        {segmented("length", ["short", "normal", "long"])}
      </section>
      <section className={styles.section}>
        <h3>Тон</h3>
        {segmented("tone", ["friendly", "business", "fun", "simple"])}
      </section>
      <section className={styles.section}>
        <h3 className={styles.rangeHead}>
          Креативность <span className={styles.rangeValue}>{creativityLabel(s.creativity)}</span>
        </h3>
        <input
          className={styles.range}
          type="range"
          min="0"
          max="100"
          step="5"
          aria-label="Креативность"
          value={Math.round(s.creativity * 100)}
          onChange={(e) => onSave({ creativity: Number(e.target.value) / 100 })}
        />
        <div className={styles.rangeScale}>
          <span>Точно</span>
          <span>Фантазия</span>
        </div>
      </section>
      <section className={styles.section}>
        <h3>Язык ответов</h3>
        {segmented("language", ["auto", "ru", "en"])}
      </section>
      <section className={styles.section}>
        <h3>О вас и ваших пожеланиях</h3>
        <textarea
          className={styles.custom}
          rows={3}
          maxLength={500}
          aria-label="О вас и ваших пожеланиях"
          placeholder="Например: «обращайся на ты», «я программист на Python», «отвечай с эмодзи»"
          value={s.custom}
          onChange={(e) => onSave({ custom: e.target.value })}
        />
      </section>
    </>
  );
}

function Usage({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className={styles.usage}>
      <div className={styles.usageTop}>
        <span>{label}</span>
        <span className={styles.usageNum}>{`${used} / ${max}`}</span>
      </div>
      <div className={pct >= 90 ? `${styles.track} ${styles.full}` : styles.track}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
