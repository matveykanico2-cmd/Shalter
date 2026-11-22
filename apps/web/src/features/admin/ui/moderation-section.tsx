import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { SafetyBadge } from "@/entities/safety-label";
import { type NewStoryItem,storyApi, storyQueries } from "@/entities/story";

import { uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm,Icon, SettingsPage, SettingsSection, TextField, toast } from "@/shared/ui";

import { adminQueries, type AdminUser, deleteStory, lookupUser,type Moderation } from "../api/admin";
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
      <OfficialStoryPublisher onPublished={() => void client.invalidateQueries({ queryKey: storyQueries.baseKey })} />
      <StoryModerationQueue />
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

function StoryModerationQueue() {
  const client = useQueryClient();
  const query = useQuery(adminQueries.stories());
  const [busy, setBusy] = useState<string | null>(null);
  const stories = query.data?.stories ?? [];
  const remove = async (id: string) => {
    if (!(await askConfirm("Удалить эту историю за нарушение правил? Действие необратимо."))) return;
    setBusy(id);
    try {
      await deleteStory(id);
      await client.invalidateQueries({ queryKey: adminQueries.stories().queryKey });
      toast("История удалена");
    } catch (err) {
      toast(errorText(err, "Не удалось удалить историю"), { error: true });
    } finally {
      setBusy(null);
    }
  };
  return (
    <SettingsSection title={`Истории на проверке (${stories.length})`} caption="Администратор может удалить любую активную историю. Автор получит уведомление.">
      {query.isPending ? <p className={styles.hint}>Загружаем…</p> : null}
      {query.isError ? <p className={styles.error}>{errorText(query.error, "Не удалось загрузить истории")}</p> : null}
      {!query.isPending && !stories.length ? <p className={styles.empty}>Активных историй нет</p> : null}
      {stories.map((story) => (
        <div key={story.id} className={styles.storyModerationRow}>
          {story.kind === "video" ? <video className={styles.storyModerationMedia} src={story.url} muted playsInline /> : <img className={styles.storyModerationMedia} src={story.url} alt="" />}
          <div className={styles.rowBody}>
            <strong className={styles.rowName}>{story.author.name}</strong>
            <span className={styles.rowMeta}>{[story.author.username ? `@${story.author.username}` : null, dateTime(story.createdAt)].filter(Boolean).join(" · ")}</span>
          </div>
          <button type="button" className={`${styles.outline} ${styles.danger}`} disabled={busy === story.id} onClick={() => void remove(story.id)}>
            {busy === story.id ? "Удаляем…" : "Удалить"}
          </button>
        </div>
      ))}
    </SettingsSection>
  );
}

function OfficialStoryPublisher({ onPublished }: { onPublished: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const publish = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const uploaded = await uploadFile(file, kind);
      await storyApi.postOfficial([{ kind, url: uploaded.url } as NewStoryItem]);
      setFile(null);
      onPublished();
      toast("История опубликована от имени Shalter");
    } catch (err) {
      toast(errorText(err, "Не удалось опубликовать историю"), { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection title="Официальные обновления Shalter" caption="История будет опубликована от имени официального аккаунта Shalter и станет видна всем пользователям.">
      <div className={styles.body}>
        <input ref={inputRef} type="file" accept="image/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className={styles.outline} disabled={busy} onClick={() => inputRef.current?.click()}>{file ? file.name : "Выбрать фото или видео"}</button>
        <button type="button" className={styles.accent} disabled={busy || !file} onClick={() => void publish()}>{busy ? "Публикуем…" : "Опубликовать от Shalter"}</button>
      </div>
    </SettingsSection>
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
