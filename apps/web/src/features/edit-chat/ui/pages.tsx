import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Button, Icon, TextField, toast } from "@/shared/ui";

import {
  type ChatPermissions,
  createInviteLink,
  decideJoinRequest,
  editChatQueries,
  setChatPermissions,
  setChatPublic,
  setSlowMode,
  setWelcomeText,
  unbanMember,
} from "../api/edit-chat";
import { useApplyChat } from "../model/use-apply-chat";
import { useSaveSetting } from "../model/use-save-setting";

import styles from "./edit-chat.module.css";
import { Banner, Empty, PersonRow, RadioRows, Section, ToggleRow } from "./parts";

type PageProps = { chat: ChatSummary; onBack: () => void };

const fail = (fallback: string) => (err: unknown) => toast(errorText(err, fallback), { error: true });

/** Частная или публичная, с @юзернеймом (openTypeTab). */
export function TypePage({ chat, onBack }: PageProps) {
  const isChannel = chat.type === "channel";
  const apply = useApplyChat(chat.id);
  const [isPublic, setPublic] = useState(!!chat.isPublic);
  const [username, setUsername] = useState(chat.username ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const handle = username.trim();
    if (isPublic && handle.length < 3) return toast("Ссылка — от 3 символов", { error: true });
    setBusy(true);
    try {
      apply((await setChatPublic(chat.id, isPublic, handle)).chat);
      onBack();
    } catch (err) {
      setBusy(false);
      fail("Не удалось сохранить")(err);
    }
  };
  return (
    <>
      <Section name={isChannel ? "Тип канала" : "Тип группы"}>
        <RadioRows
          label={isChannel ? "Тип канала" : "Тип группы"}
          options={[
            { value: false, label: isChannel ? "Частный канал" : "Частная группа", sub: "Вступить можно только по пригласительной ссылке" },
            { value: true, label: isChannel ? "Публичный канал" : "Публичная группа", sub: "Найдут в поиске и откроют по ссылке" },
          ]}
          value={isPublic}
          onPick={setPublic}
        />
      </Section>
      {isPublic ? (
        <Section caption="Латиница, цифры и подчёркивание, от 3 символов.">
          <label className={styles.field}>
            <span>Юзернейм</span>
            <TextField
              className={styles.mono}
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, ""))}
            />
          </label>
        </Section>
      ) : null}
      <Button className={styles.save} disabled={busy} onClick={() => void save()}>
        Сохранить
      </Button>
    </>
  );
}

/** Пригласительная ссылка и заявки на вступление (openInviteTab). */
export function InvitePage({ chat }: PageProps) {
  const apply = useApplyChat(chat.id);
  const saveSetting = useSaveSetting(chat);
  const link = chat.inviteCode ? publicUrl(`/join/${chat.inviteCode}`) : null;
  const renew = async () => {
    try {
      apply((await createInviteLink(chat.id, !!link)).chat);
      toast(link ? "Старая ссылка отозвана, создана новая" : "Ссылка создана");
    } catch (err) {
      fail("Не удалось получить ссылку")(err);
    }
  };
  return (
    <>
      <Banner icon="Link">По этой ссылке можно вступить в {chat.type === "channel" ? "канал" : "группу"} без приглашения от администратора.</Banner>
      <Section name="Пригласительная ссылка" caption="Если ссылка попала не туда — отзовите её, старая перестанет работать.">
        {link ? (
          <button type="button" className={styles.inviteLink} title="Скопировать" onClick={() => void copyText(link, "Ссылка скопирована")}>
            <span className={styles.mono}>{link.replace(/^https?:\/\//, "")}</span>
            <Icon name="Copy" size={20} />
          </button>
        ) : (
          <Empty>Ссылка ещё не создана</Empty>
        )}
        <button type="button" className={`${styles.row} ${styles.accentRow}`} onClick={() => void renew()}>
          <Icon name={link ? "X" : "Plus"} size={24} />
          {link ? "Отозвать и создать новую" : "Создать ссылку"}
        </button>
      </Section>
      <Section>
        <ToggleRow
          title="Заявки на вступление"
          subtitle="По ссылке подают заявку, а не входят сразу"
          checked={!!chat.approveJoins}
          onChange={(v) => void saveSetting({ approveJoins: v })}
        />
      </Section>
    </>
  );
}

const SLOW_MODE = [
  { value: 0, label: "Выключен" },
  { value: 10, label: "10 секунд" },
  { value: 30, label: "30 секунд" },
  { value: 60, label: "1 минута" },
  { value: 300, label: "5 минут" },
  { value: 900, label: "15 минут" },
] as const;

/** Что могут участники, медленный режим, анонимные админы (openPermissionsTab). */
export function PermissionsPage({ chat }: PageProps) {
  const client = useQueryClient();
  const apply = useApplyChat(chat.id);
  const saveSetting = useSaveSetting(chat);
  const query = editChatQueries.permissions(chat.id);
  const data = useQuery(query).data;
  const setFlag = async (id: keyof ChatPermissions, value: boolean) => {
    if (!data) return;
    const before = data.permissions;
    const next = { ...before, [id]: value };
    client.setQueryData(query.queryKey, { ...data, permissions: next });
    try {
      const res = await setChatPermissions(chat.id, next);
      apply(res.chat);
    } catch (err) {
      client.setQueryData(query.queryKey, (d) => (d ? { ...d, permissions: before } : d));
      fail("Не удалось сохранить права")(err);
    }
  };
  const slowMode = async (seconds: number) => {
    try {
      apply((await setSlowMode(chat.id, seconds)).chat);
    } catch (err) {
      fail("Не удалось изменить")(err);
    }
  };
  return (
    <>
      {data ? (
        <Section name="Что могут участники" caption="Не касается владельцев, администраторов и модераторов.">
          {data.fields.map((f) => (
            <ToggleRow
              key={f.id}
              title={f.label}
              checked={data.permissions[f.id as keyof ChatPermissions] !== false}
              onChange={(v) => void setFlag(f.id as keyof ChatPermissions, v)}
            />
          ))}
        </Section>
      ) : null}
      <Section name="Медленный режим" caption="Сколько ждать между сообщениями одному участнику.">
        <RadioRows label="Медленный режим" options={SLOW_MODE} value={chat.slowModeSeconds ?? 0} onPick={(s) => void slowMode(s)} />
      </Section>
      <Section>
        <ToggleRow
          title="Анонимные администраторы"
          subtitle="Админы пишут от имени группы"
          checked={!!chat.anonymousAdmins}
          onChange={(v) => void saveSetting({ anonymousAdmins: v })}
        />
      </Section>
    </>
  );
}

/** Приветствие новым участникам (openWelcomeTab). */
export function WelcomePage({ chat, onBack }: PageProps) {
  const apply = useApplyChat(chat.id);
  const [text, setText] = useState(chat.welcomeText ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await setWelcomeText(chat.id, text);
      apply(res.chat);
      toast(res.welcomeText ? "Приветствие сохранено" : "Приветствие выключено");
      onBack();
    } catch (err) {
      setBusy(false);
      fail("Не удалось сохранить")(err);
    }
  };
  return (
    <>
      <Banner icon="MessageSquare">Группа сама напишет это каждому новому участнику. {"{name}"} заменится на имя.</Banner>
      <Section caption="Оставьте пустым, чтобы выключить приветствие.">
        <label className={styles.field}>
          <span>Текст приветствия</span>
          <textarea className={styles.textarea} value={text} maxLength={1000} rows={4} onChange={(e) => setText(e.target.value)} />
        </label>
      </Section>
      <Button className={styles.save} disabled={busy} onClick={() => void save()}>
        Сохранить
      </Button>
    </>
  );
}

/** Заявки на вступление: принять или отклонить (openRequestsTab). */
export function RequestsPage({ chat }: PageProps) {
  const client = useQueryClient();
  const apply = useApplyChat(chat.id);
  const query = editChatQueries.joinRequests(chat.id);
  const requests = useQuery(query).data;
  const answer = async (userId: string, approve: boolean) => {
    try {
      const res = await decideJoinRequest(chat.id, userId, approve);
      client.setQueryData(query.queryKey, (list) => list?.filter((r) => r.userId !== userId));
      if (res.chat) {
        apply(res.chat);
        void client.invalidateQueries({ queryKey: chatQueries.card(chat.id).queryKey });
      }
      toast(approve ? "Участник добавлен" : "Заявка отклонена");
    } catch (err) {
      fail("Не удалось обработать заявку")(err);
    }
  };
  return (
    <Section caption="Заявки приходят, когда включено «Заявки на вступление».">
      {requests?.length ? (
        requests.map((r) => (
          <PersonRow key={r.userId} user={r.user}>
            <Button variant="link" onClick={() => void answer(r.userId, true)}>
              Принять
            </Button>
            <button type="button" className={styles.iconDanger} title="Отклонить" onClick={() => void answer(r.userId, false)}>
              <Icon name="X" size={20} />
            </button>
          </PersonRow>
        ))
      ) : requests ? (
        <Empty>Новых заявок нет</Empty>
      ) : null}
    </Section>
  );
}

/** Заблокированные в чате: вернуть по одному (openBannedTab). */
export function BannedPage({ chat }: PageProps) {
  const client = useQueryClient();
  const apply = useApplyChat(chat.id);
  const query = editChatQueries.banned(chat.id);
  const banned = useQuery(query).data;
  const unban = async (userId: string) => {
    try {
      apply((await unbanMember(chat.id, userId)).chat);
      client.setQueryData(query.queryKey, (list) => list?.filter((u) => u.id !== userId));
      toast("Пользователь разблокирован");
    } catch (err) {
      fail("Не удалось разблокировать")(err);
    }
  };
  return (
    <Section caption={`Заблокированные не могут вернуться в ${chat.type === "channel" ? "канал" : "группу"} по ссылке.`}>
      {banned?.length ? (
        banned.map((u) => (
          <PersonRow key={u.id} user={u}>
            <Button variant="link" onClick={() => void unban(u.id)}>
              Разблокировать
            </Button>
          </PersonRow>
        ))
      ) : banned ? (
        <Empty>Никого не заблокировано</Empty>
      ) : null}
    </Section>
  );
}
