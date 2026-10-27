import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Icon, SettingsSection, TextField } from "@/shared/ui";

import { adminQueries, reviewAd,type ReviewCampaign, type ReviewList } from "../api/admin";
import { dateTime, fmtNumber } from "../lib/format";

import styles from "./admin.module.css";

// Очередь рекламы на проверке — AdReviewQueue в public/js/components/adModeration.js.

const QUICK_REASONS = [
  "Обман или несуществующий товар",
  "Запрещённые товары или услуги",
  "18+ и подобное",
  "Ссылка ведёт не туда, куда обещает текст",
  "Чужой бренд без разрешения",
  "Текст не читается: капс, спам-символы",
];

export function AdReviewQueue() {
  const client = useQueryClient();
  const query = useQuery(adminQueries.adReview());
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const list = query.data?.campaigns;
  const loadError = query.isError ? errorText(query.error, "Не удалось загрузить очередь проверки") : null;

  const decide = async (c: ReviewCampaign, approve: boolean, why: string) => {
    setBusy(c.id);
    setRejectError(null);
    try {
      await reviewAd(c.id, approve, why);
      setRejecting(null);
      setReason("");
      await client.invalidateQueries({ queryKey: adminQueries.adReview().queryKey });
    } catch (err) {
      if (approve) setError(errorText(err, "Не получилось"));
      else setRejectError(errorText(err, "Не получилось"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSection title={`Реклама на проверке${list ? ` (${list.length})` : ""}`}>
      <div className={styles.body}>
        <p className={styles.hint}>
          Объявление уходит сюда сразу, как рекламодатель его создал, и до проверки не показывается никому. «Проверил» ставит кампанию на паузу — включит её владелец сам; «Отказ» возвращает
          объявление автору с причиной.
        </p>
        {error || loadError ? <p className={styles.error}>{error ?? loadError}</p> : null}
        {query.isPending ? <p className={styles.hint}>Загружаем…</p> : null}
        {list && list.length === 0 && !loadError ? <p className={styles.empty}>Объявлений на проверке нет</p> : null}
        {(list ?? []).map((c) => (
          <AdCard
            key={c.id}
            c={c}
            placements={query.data?.placements}
            busy={busy === c.id}
            rejecting={rejecting === c.id}
            reason={reason}
            rejectError={rejectError}
            onReason={setReason}
            onApprove={() => void decide(c, true, "")}
            onStartReject={() => {
              setRejecting(c.id);
              setRejectError(null);
              setReason("");
            }}
            onReject={() => {
              const why = reason.trim();
              if (!why) {
                setRejectError("Без причины отказ не отправляется — рекламодателю нечего будет исправлять");
                return;
              }
              void decide(c, false, why);
            }}
            onCancel={() => {
              setRejecting(null);
              setRejectError(null);
            }}
          />
        ))}
        {list && !loadError ? (
          <button type="button" className={styles.outline} onClick={() => void query.refetch()}>
            Обновить очередь
          </button>
        ) : null}
      </div>
    </SettingsSection>
  );
}

type CardProps = {
  c: ReviewCampaign;
  placements: ReviewList["placements"] | undefined;
  busy: boolean;
  rejecting: boolean;
  reason: string;
  rejectError: string | null;
  onReason: (v: string) => void;
  onApprove: () => void;
  onStartReject: () => void;
  onReject: () => void;
  onCancel: () => void;
};

function AdCard({ c, placements, busy, rejecting, reason, rejectError, onReason, onApprove, onStartReject, onReject, onCancel }: CardProps) {
  const owner = c.owner as { id: string; name?: string; username?: string | null };
  const places = c.placements.map((p) => placements?.[p] ?? p).join(", ");
  return (
    <div className={styles.ad}>
      <div className={styles.adHead}>
        <div>
          <p className={styles.adTitle}>{c.title || "Без названия"}</p>
          <p className={styles.adPlace}>{`${owner.username ? `@${owner.username}` : owner.name || owner.id} · ${dateTime(c.createdAt)}`}</p>
        </div>
        <span className={styles.adStatus}>Ждёт проверки</span>
      </div>
      <p className={styles.adText}>{c.text}</p>
      {c.imageUrl ? <img className={styles.adImage} src={c.imageUrl} alt="" /> : null}
      {c.url ? (
        <p className={styles.adLink}>
          <Icon name="Globe" size={13} />
          <a className={styles.mono} href={c.url} target="_blank" rel="noopener noreferrer nofollow">
            {c.url}
          </a>
        </p>
      ) : null}
      <p className={styles.hint}>{`Места показа: ${places} · ⭐ ${fmtNumber(c.cpmStars)} за 1000 показов · бюджет ⭐ ${fmtNumber(c.budgetStars)}`}</p>
      {c.rejectReason ? <p className={styles.hint}>{`Прошлый отказ: ${c.rejectReason}`}</p> : null}
      {rejecting ? (
        <>
          <p className={styles.fieldLabel}>Почему отказ</p>
          <div className={styles.chips}>
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" className={styles.chip} onClick={() => onReason(r)}>
                {r}
              </button>
            ))}
          </div>
          <TextField autoFocus placeholder="Причина отказа — её увидит рекламодатель" value={reason} onChange={(e) => onReason(e.target.value)} />
          {rejectError ? <p className={styles.error}>{rejectError}</p> : null}
          <div className={styles.inline}>
            <button type="button" className={`${styles.outline} ${styles.danger}`} disabled={busy} onClick={onReject}>
              {busy ? "Отправляем…" : "Отклонить объявление"}
            </button>
            <button type="button" className={styles.outline} onClick={onCancel}>
              Отмена
            </button>
          </div>
        </>
      ) : (
        <div className={styles.inline}>
          <button type="button" className={styles.accent} disabled={busy} onClick={onApprove}>
            {busy ? "Отправляем…" : "Проверил"}
          </button>
          <button type="button" className={`${styles.outline} ${styles.danger}`} disabled={busy} onClick={onStartReject}>
            Отказ
          </button>
        </div>
      )}
    </div>
  );
}
