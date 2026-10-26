import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { type CallKind, type CallListItem, callQueries, useStartCall } from "@/features/call";

import { openDm } from "@/entities/chat";
import { type SelfUser, useSession } from "@/entities/session";
import { type Contact, ContactPicker, userQueries } from "@/entities/user";

import { errorText } from "@/shared/lib/error-text";
import { timeAgo } from "@/shared/lib/presence";
import { Avatar, Icon, toast } from "@/shared/ui";

import styles from "./calls-view.module.css";

/** /calls — контакты с кнопками звонка и история звонков, как public/js/views/calls.js. */
export function CallsView() {
  const me = useSession().data?.user;
  return me ? <Calls me={me} /> : null;
}

const isMissed = (c: CallListItem) => (c.status === "missed" || c.status === "declined") && c.direction === "incoming";

function durationLabel(sec: number) {
  if (sec <= 0) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function Calls({ me }: { me: SelfUser }) {
  const navigate = useNavigate();
  const start = useStartCall(me);
  const calls = useQuery(callQueries.history()).data ?? [];
  const contacts = useQuery(userQueries.contacts()).data ?? [];
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Звонок человеку: сначала личка с ним (существующая или новая), потом звонок в неё.
  const callUser = async (user: { id: string; name: string; avatarColor?: string | null }, kind: CallKind) => {
    if (busy) return;
    setBusy(user.id);
    try {
      const { chat } = await openDm(user.id, user.name, user.avatarColor);
      await start.call(chat.id, kind);
    } catch (err) {
      toast(errorText(err, "Не удалось позвонить"), { error: true });
    } finally {
      setBusy(null);
    }
  };

  const missedCount = calls.filter(isMissed).length;
  const shown = filter === "missed" ? calls.filter(isMissed) : calls;

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} title="Назад">
          <Icon name="ChevronLeft" size={20} />
        </Link>
        <h1 className={styles.title}>Звонки</h1>
      </header>
      <div className={styles.startPanel}>
        <button type="button" className={styles.start} onClick={() => setPicking(true)}>
          <Icon name="Phone" size={17} />
          Позвонить
        </button>
      </div>
      <div className={styles.body}>
        {contacts.length ? <p className={styles.section}>Контакты — {contacts.length}</p> : null}
        {contacts.map((u) => (
          <ContactRow key={u.id} user={u} busy={busy === u.id} onCall={(kind) => void callUser(u, kind)} />
        ))}
        <div className={styles.historyHead}>
          <p className={styles.section}>Недавние</p>
          {calls.length ? (
            <div className={styles.filter}>
              <button type="button" className={filter === "all" ? `${styles.chip} ${styles.chipActive}` : styles.chip} onClick={() => setFilter("all")}>
                Все
              </button>
              <button type="button" className={filter === "missed" ? `${styles.chip} ${styles.chipActive}` : styles.chip} onClick={() => setFilter("missed")}>
                {missedCount ? `Пропущенные ${missedCount}` : "Пропущенные"}
              </button>
            </div>
          ) : null}
        </div>
        {!calls.length ? (
          <p className={styles.empty}>Звонков ещё не было</p>
        ) : !shown.length ? (
          <p className={styles.empty}>Пропущенных звонков нет</p>
        ) : (
          shown.map((c) => <HistoryRow key={c.id} call={c} onOpen={() => void navigate(`/chat/${c.chatId}`)} onCall={(kind) => void start.call(c.chatId, kind, { ringAll: true })} />)
        )}
        {!contacts.length && !calls.length ? <p className={styles.empty}>Добавьте человека в контакты — и сможете позвонить ему отсюда в одно нажатие.</p> : null}
      </div>
      {picking ? <ContactPicker title="Кому позвонить" exclude={[me.id]} onClose={() => setPicking(false)} onPick={(u) => void callUser(u, "audio")} /> : null}
    </div>
  );
}

function CallActions({ onCall, disabled = false }: { onCall: (kind: CallKind) => void; disabled?: boolean }) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.action} title="Позвонить" disabled={disabled} onClick={() => onCall("audio")}>
        <Icon name="Phone" size={17} />
      </button>
      <button type="button" className={styles.action} title="Видеозвонок" disabled={disabled} onClick={() => onCall("video")}>
        <Icon name="Video" size={17} />
      </button>
    </div>
  );
}

function HistoryRow({ call: c, onOpen, onCall }: { call: CallListItem; onOpen: () => void; onCall: (kind: CallKind) => void }) {
  const missed = isMissed(c);
  const unanswered = !missed && (c.status === "missed" || c.status === "declined");
  const name = c.group?.title ?? c.otherUser?.name ?? "Неизвестно";
  const outcome = missed
    ? " · пропущен"
    : unanswered
      ? c.status === "declined"
        ? " · отклонён"
        : " · без ответа"
      : c.durationSec
        ? ` · ${durationLabel(c.durationSec)}`
        : "";
  return (
    <div className={styles.row}>
      <button type="button" className={styles.open} title="Открыть чат" onClick={onOpen}>
        <Avatar size={54} name={name} color={c.group?.avatarColor ?? c.otherUser?.avatarColor ?? "#8A8F98"} image={c.group?.avatarImage ?? c.otherUser?.avatarImage} />
      </button>
      <div className={styles.rowBody}>
        <p className={missed ? `${styles.name} ${styles.missed}` : styles.name}>{name}</p>
        <p className={styles.status}>
          <span className={missed ? `${styles.dir} ${styles.dirMissed}` : styles.dir}>
            <Icon name={c.kind === "video" ? "Video" : "Phone"} size={12} />
          </span>{" "}
          {c.direction === "incoming" ? "Входящий" : "Исходящий"}
          {outcome} · {timeAgo(c.startedAt)}
        </p>
      </div>
      <CallActions onCall={onCall} />
    </div>
  );
}

function ContactRow({ user: u, busy, onCall }: { user: Contact; busy: boolean; onCall: (kind: CallKind) => void }) {
  return (
    <div className={styles.row}>
      <Avatar size={54} name={u.name} color={u.avatarColor} image={u.avatarImage} online={!!u.online} />
      <div className={styles.rowBody}>
        <p className={styles.name}>{u.name}</p>
        <p className={u.online ? `${styles.status} ${styles.online}` : styles.status}>{busy ? "Соединяем…" : u.online ? "в сети" : u.username ? `@${u.username}` : "не в сети"}</p>
      </div>
      <CallActions onCall={onCall} disabled={busy} />
    </div>
  );
}
