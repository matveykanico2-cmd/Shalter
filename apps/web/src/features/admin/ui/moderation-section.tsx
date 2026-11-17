import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SafetyBadge } from "@/entities/safety-label";

import { errorText } from "@/shared/lib/error-text";
import { Icon, SettingsPage, SettingsSection, TextField } from "@/shared/ui";

import { adminQueries, type AdminUser, lookupUser,type Moderation } from "../api/admin";
import { dateTime } from "../lib/format";

import { AdReviewQueue } from "./ad-review-queue";
import styles from "./admin.module.css";
import { LabelsEditor, StatusCatalogEditor } from "./labels-editor";
import { ChatLookup, Directory, MailCheck } from "./moderation-tools";
import { UserCard } from "./user-card";

// «Настройки → Модерация» — renderModeration в public/js/views/settings/index.js.

const LOOKUP_HINT = "В карточке — выдача Premium, рекламы, звёзд и подарков, метка безопасности, блокировка и разблокировка, жалобы и выгрузка данных.";

export function ModerationSection() {
  const client = useQueryClient();
  const query = useQuery(adminQueries.moderation());
  const [card, setCard] = useState<AdminUser | null>(null);
  const subtitle = "Жалобы, блокировки и метки безопасности. Нажмите на строку, чтобы открыть карточку пользователя.";

  if (query.isError) {
    return (
      <SettingsPage>
        <p className={styles.error}>{errorText(query.error, "Не удалось загрузить данные модерации")}</p>
      </SettingsPage>
    );
  }
  const data = query.data;
  if (!data) {
    return (
      <SettingsPage>
        <p className={styles.hint}>Загружаем…</p>
      </SettingsPage>
    );
  }

  const syncUser = (user: Partial<AdminUser> & { id: string }) => {
    client.setQueryData<Moderation>(adminQueries.moderation().queryKey, (current) => {
      if (!current) return current;
      const update = (list: AdminUser[], include: boolean) => {
        const next = list.filter((item) => item.id !== user.id);
        if (!include) return next;
        const previous = list.find((item) => item.id === user.id);
        return [...next, { ...previous, ...user } as AdminUser];
      };
      return {
        ...current,
        banned: update(current.banned, user.isBanned === true) as Moderation["banned"],
        labeled: update(current.labeled, !!user.safetyLabel) as Moderation["labeled"],
      };
    });
    void client.invalidateQueries({ queryKey: adminQueries.moderation().queryKey });
  };

  const refresh = () => void query.refetch();

  return (
    <SettingsPage subtitle={subtitle}>
      <div className={styles.moderationHero}>
        <div>
          <p className={styles.moderationEyebrow}>Центр контроля</p>
          <h2 className={styles.moderationTitle}>Модерация</h2>
          <p className={styles.moderationLead}>Все изменения применяются сразу. Списки обновляются автоматически после действия.</p>
        </div>
        <button type="button" className={styles.outline} onClick={refresh} disabled={query.isFetching}>
          <Icon name="RotateCw" size={14} /> {query.isFetching ? "Обновляем…" : "Обновить"}
        </button>
      </div>
      <div className={styles.moderationStats} aria-label="Сводка модерации">
        <div className={styles.moderationStat}><span className={styles.moderationStatValue}>{data.openReports.length}</span><span>открытых жалоб</span></div>
        <div className={styles.moderationStat}><span className={styles.moderationStatValue}>{data.banned.length}</span><span>заблокированных</span></div>
        <div className={styles.moderationStat}><span className={styles.moderationStatValue}>{data.labeled.length}</span><span>с метками</span></div>
      </div>
      <UserLookup onFound={setCard} />
      <ChatLookup />
      <Directory onOpenUser={setCard} />
      <MailCheck />
      <LabelsEditor labels={data.labels} />
      <StatusCatalogEditor items={data.statusCatalog} />
      <SettingsSection title={`Открытые жалобы (${data.openReports.length})`}>
        {data.openReports.length === 0 ? (
          <p className={styles.empty}>Необработанных жалоб нет</p>
        ) : (
          data.openReports.map((r) => (
            <div key={r.id} className={styles.report}>
              <p className={styles.reportHead}>
                <span className={styles.reportReason}>{r.reasonLabel}</span>
                <span className={styles.reportDate}>{dateTime(r.at)}</span>
              </p>
              <p className={styles.rowMeta}>{`На: ${r.subject ? r.subject.name : "—"} · от: ${r.reporter.name}`}</p>
              {r.quoted ? <p className={styles.quote}>{`«${r.quoted}»`}</p> : null}
              {r.details ? <p className={styles.details}>{`Пояснение: ${r.details}`}</p> : null}
              {r.subject ? (
                <button type="button" className={styles.outline} onClick={() => setCard(r.subject)}>
                  Открыть карточку
                </button>
              ) : null}
            </div>
          ))
        )}
      </SettingsSection>
      <AdReviewQueue />
      <SettingsSection title={`Заблокированные (${data.banned.length})`}>
        {data.banned.length === 0 ? (
          <p className={styles.empty}>Заблокированных аккаунтов нет</p>
        ) : (
          data.banned.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              meta={`${u.bannedAt ? dateTime(u.bannedAt) : "дата неизвестна"} · ${u.bannedUntil ? `до ${dateTime(u.bannedUntil)}` : "навсегда"} · ${u.banReason || "причина не указана"}`}
              onOpen={setCard}
            />
          ))
        )}
      </SettingsSection>
      <SettingsSection title={`С метками безопасности (${data.labeled.length})`}>
        {data.labeled.length === 0 ? (
          <p className={styles.empty}>Помеченных аккаунтов нет</p>
        ) : (
          data.labeled.map((u) => <UserRow key={u.id} user={u} meta={u.safetyLabelAt ? dateTime(u.safetyLabelAt) : ""} onOpen={setCard} />)
        )}
      </SettingsSection>
      {card ? <UserCard key={card.id} user={card} onChanged={syncUser} onClose={() => setCard(null)} /> : null}
    </SettingsPage>
  );
}

/** «Найти любой аккаунт»: @юзернейм, телефон, почта или id → карточка. */
function UserLookup({ onFound }: { onFound: (u: AdminUser) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lookup = async () => {
    const q = value.trim();
    setError(null);
    if (!q) return;
    try {
      onFound((await lookupUser(q)).user);
    } catch (err) {
      setError(errorText(err, "Пользователь не найден"));
    }
  };
  return (
    <SettingsSection title="Найти любой аккаунт">
      <div className={styles.body}>
        <TextField
          placeholder="@юзернейм, +7…, почта или id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void lookup();
          }}
        />
        <button type="button" className={styles.accent} onClick={() => void lookup()}>
          Открыть карточку
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
        <p className={styles.hint}>{LOOKUP_HINT}</p>
      </div>
    </SettingsSection>
  );
}

function UserRow({ user, meta, onOpen }: { user: AdminUser; meta: string; onOpen: (u: AdminUser) => void }) {
  return (
    <button type="button" className={styles.row} onClick={() => onOpen(user)}>
      <span className={styles.rowBody}>
        <span className={styles.rowName}>
          {user.name}
          {user.safetyLabel ? <SafetyBadge label={user.safetyLabel} mini /> : null}
        </span>
        <span className={styles.rowMeta}>{meta}</span>
      </span>
      <span className={styles.chevron}>
        <Icon name="ChevronLeft" size={16} />
      </span>
    </button>
  );
}
