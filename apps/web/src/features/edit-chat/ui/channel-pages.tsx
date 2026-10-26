import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { chatQueries, type ChatSummary, useChats } from "@/entities/chat";

import { ALL_EMOJI } from "@/shared/lib/emoji-list";
import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { askConfirm, Avatar, Button, Dialog, Icon, TextField, toast } from "@/shared/ui";

import { type DiscussionAction, editChatQueries, setAllowedReactions, setChatDiscussion, setCommentPrice } from "../api/edit-chat";
import { describeAdminAction } from "../lib/admin-log";
import { allowedReactions } from "../lib/chat-fields";
import { useApplyChat } from "../model/use-apply-chat";

import styles from "./edit-chat.module.css";
import { Banner, Empty, RadioRows, Section } from "./parts";

type PageProps = { chat: ChatSummary };

const fail = (fallback: string) => (err: unknown) => toast(errorText(err, fallback), { error: true });

/** Реакции под постами канала: все или только выбранные (openReactionsTab). */
export function ReactionsPage({ chat }: PageProps) {
  const apply = useApplyChat(chat.id);
  const saved = allowedReactions(chat);
  const [restricted, setRestricted] = useState(!!saved);
  const [draft, setDraft] = useState<readonly string[]>(saved ?? []);
  const save = async (next: readonly string[] | null) => {
    try {
      apply((await setAllowedReactions(chat.id, next)).chat);
    } catch (err) {
      fail("Не удалось сохранить")(err);
    }
  };
  const toggle = (emoji: string) => {
    const next = draft.includes(emoji) ? draft.filter((x) => x !== emoji) : [...draft, emoji];
    setDraft(next);
    void save(next);
  };
  return (
    <>
      <Section name="Реакции под постами">
        <RadioRows
          label="Реакции под постами"
          options={[
            { value: false, label: "Все реакции" },
            { value: true, label: "Только выбранные" },
          ]}
          value={restricted}
          onPick={(v) => {
            setRestricted(v);
            void save(v ? draft : null);
          }}
        />
      </Section>
      {restricted ? (
        <Section name={`Разрешено: ${draft.length}`}>
          <div className={styles.reactions}>
            {ALL_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className={draft.includes(e) ? `${styles.reaction} ${styles.reactionOn}` : styles.reaction}
                aria-pressed={draft.includes(e)}
                onClick={() => toggle(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/** Группа обсуждения и цена комментария (openDiscussionTab). */
export function DiscussionPage({ chat }: PageProps) {
  const client = useQueryClient();
  const apply = useApplyChat(chat.id);
  const [picking, setPicking] = useState(false);
  const [price, setPrice] = useState(String(chat.commentPriceStars ?? 0));
  const linked = !!chat.linkedDiscussionChatId;

  const discussion = async (action: DiscussionAction, groupId?: string) => {
    try {
      const res = await setChatDiscussion(chat.id, action, groupId);
      apply(res.chat);
      // Новая группа обсуждения — сразу в списке чатов.
      if (action === "create") void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
      toast(res.discussion ? `Обсуждение: «${res.discussion.title}»` : "Комментарии отключены");
    } catch (err) {
      fail("Не удалось изменить обсуждение")(err);
    }
  };
  const unlink = async () => {
    if (!(await askConfirm("Отключить комментарии? Группа обсуждения останется на месте со всей перепиской."))) return;
    await discussion("unlink");
  };
  const savePrice = async () => {
    try {
      const res = await setCommentPrice(chat.id, Number(price));
      apply(res.chat);
      setPrice(String(res.commentPriceStars));
      toast(res.commentPriceStars > 0 ? `Комментарии стоят ${res.commentPriceStars} ⭐` : "Комментарии бесплатны");
    } catch (err) {
      fail("Не удалось сохранить")(err);
    }
  };

  return (
    <>
      <Banner icon="MessageSquare">
        {linked ? "Под постами есть комментарии — они пишутся в связанной группе." : "Свяжите канал с группой — и под каждым постом появятся комментарии."}
      </Banner>
      <Section>
        {linked ? null : (
          <button type="button" className={`${styles.row} ${styles.accentRow}`} onClick={() => void discussion("create")}>
            <Icon name="Plus" size={24} />
            Создать группу обсуждения
          </button>
        )}
        <button type="button" className={`${styles.row} ${styles.accentRow}`} onClick={() => setPicking(true)}>
          <Icon name="Link" size={24} />
          {linked ? "Выбрать другую группу" : "Связать существующую"}
        </button>
        {linked ? (
          <button type="button" className={`${styles.row} ${styles.dangerRow}`} onClick={() => void unlink()}>
            <Icon name="X" size={24} />
            Отключить комментарии
          </button>
        ) : null}
      </Section>
      <Section name="Цена комментария" caption="С Premium читатели комментируют бесплатно.">
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Звёзд за комментарий (0 — бесплатно)</span>
            <TextField type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <Button className={styles.inlineButton} onClick={() => void savePrice()}>
            Сохранить цену
          </Button>
        </div>
      </Section>
      {picking ? (
        <GroupPicker
          title="Какую группу связать с каналом"
          onPick={(id) => {
            setPicking(false);
            void discussion("link", id);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </>
  );
}

/** Выбор своей группы — как public/js/components/chatPickerDialog.js. */
function GroupPicker({ title, onPick, onClose }: { title: string; onPick: (chatId: string) => void; onClose: () => void }) {
  const groups = (useChats().data ?? []).filter((c) => c.type === "group" && !c.archived);
  return (
    <Dialog title={title} onClose={onClose}>
      {groups.length ? (
        <div className={styles.pickList}>
          {groups.map((c) => {
            const count = c.membersCount ?? c.memberIds.length;
            return (
              <button key={c.id} type="button" className={styles.person} onClick={() => onPick(c.id)}>
                <Avatar size={36} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{c.title}</span>
                  <span className={styles.subtitle}>
                    {count} {plural(count, "участник", "участника", "участников")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty>У вас пока нет групп — создайте её, и она появится здесь</Empty>
      )}
      <Button variant="link" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}

const TIME = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Журнал администраторов за 30 дней (public/js/components/adminLogDialog.js). */
export function AdminLogPage({ chat }: PageProps) {
  const log = useInfiniteQuery(editChatQueries.adminLog(chat.id));
  if (log.isError) return <Empty>{errorText(log.error, "Не удалось загрузить журнал")}</Empty>;
  if (!log.data) return <Empty>Загрузка…</Empty>;
  const users = new Map(log.data.pages.flatMap((p) => p.users).map((u) => [u.id, u]));
  const entries = log.data.pages.flatMap((p) => p.entries);
  if (!entries.length) return <Empty>За последние 30 дней администраторы ничего не меняли</Empty>;
  const name = (id: string) => users.get(id)?.name ?? "кто-то";
  return (
    <Section>
      <ul className={styles.log} aria-label="Недавние действия">
        {entries.map((e) => {
          const actor = users.get(e.actorId);
          return (
            <li key={e.id} className={styles.person}>
              <Avatar size={32} name={actor?.name ?? "?"} color={actor?.avatarColor} image={actor?.avatarImage} />
              <span className={styles.rowBody}>
                <span>
                  <b>{actor?.name ?? "Кто-то"}</b> {describeAdminAction(e, name)}
                </span>
                <span className={styles.subtitle}>{TIME.format(new Date(e.createdAt))}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {log.hasNextPage ? (
        <Button variant="link" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
          Показать ещё
        </Button>
      ) : null}
    </Section>
  );
}
