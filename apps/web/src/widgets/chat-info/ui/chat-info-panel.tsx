import { useQuery } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useState } from "react";

import { AUTO_DELETE_DURATIONS, autoDeleteLabel, MuteDialog, useChatActions } from "@/features/chat-actions";

import { type ChatMember, type ChatSummary, chatTitle, isChatAdmin, isChatMuted, isChatOwner, memberRoleLabel } from "@/entities/chat";
import { ReportDialog, type ReportTarget } from "@/entities/report";
import type { SelfUser } from "@/entities/session";
import { birthdayText, isBirthdayToday, userQueries } from "@/entities/user";

import { plural, statusLabel } from "@/shared/lib/presence";
import { publicUrl } from "@/shared/lib/public-link";
import { Avatar, Icon, type IconName, InfoRow, Menu } from "@/shared/ui";

import { membersLine, sortMembers } from "../lib/members";

import styles from "./chat-info-panel.module.css";

type Props = { chat: ChatSummary; members: readonly ChatMember[]; me: SelfUser; onClose: () => void };

type Dialog = { kind: "mute" } | { kind: "report"; target: ReportTarget; label: string } | null;

/** «Информация о чате» справа (на телефоне — на весь экран) — как public/js/components/infoPanel.js. */
export function ChatInfoPanel({ chat, members, me, onClose }: Props) {
  const actions = useChatActions(chat, me.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [autoDeleteAt, setAutoDeleteAt] = useState<{ x: number; y: number } | null>(null);
  const isDm = chat.type === "dm";
  const other = isDm ? chat.otherUser : undefined;
  const title = chatTitle(chat);
  const isAdmin = isChatAdmin(chat, me.id);
  const muted = isChatMuted(chat);
  const blocked = !!other && me.blockedUserIds.includes(other.id);
  const kind = chat.type === "channel" ? "канал" : "группу";
  const status = other ? statusLabel(other) : null;

  return (
    <aside className={styles.panel} aria-label="Информация о чате">
      <div className={styles.header}>
        <h2>{isDm ? "Профиль" : chat.type === "channel" ? "Канал" : "Группа"}</h2>
        <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.hero}>
          <Avatar size={120} name={other?.name ?? title} color={other?.avatarColor ?? chat.avatarColor} image={other?.avatarImage ?? chat.avatarImage} />
          <p className={styles.title}>
            {other?.name ?? title}
            {(other ? other.isVerified : chat.isVerified) ? (
              <span className={styles.verified} title="Подтверждённый аккаунт">
                <Icon name="Verified" size={16} />
              </span>
            ) : null}
          </p>
          {other ? (
            <p className={status === "в сети" ? `${styles.subtitle} ${styles.online}` : styles.subtitle}>{status ?? "был(а) недавно"}</p>
          ) : !isDm ? (
            <p className={styles.subtitle}>{membersLine(chat, members)}</p>
          ) : null}
        </div>

        {other ? <ProfileRows userId={other.id} /> : null}
        {!isDm && (chat.description || (chat.isPublic && chat.username)) ? (
          <div className={styles.card}>
            {chat.description ? <InfoRow icon="Info" value={chat.description} label="Описание" multiline /> : null}
            {chat.isPublic && chat.username ? (
              <InfoRow
                icon="Link"
                value={publicUrl(`/u/${chat.username}`)}
                label={chat.type === "channel" ? "Ссылка на канал" : "Ссылка на группу"}
                accent
                copy={publicUrl(`/u/${chat.username}`)}
              />
            ) : null}
          </div>
        ) : null}

        <div className={styles.card}>
          <Row icon={muted ? "Bell" : "BellOff"} onClick={() => (muted ? void actions.mute({ off: true }) : setDialog({ kind: "mute" }))}>
            {muted ? "Включить уведомления" : "Отключить уведомления"}
          </Row>
          {isDm || isAdmin ? (
            <Row icon="Clock" onClick={(e) => setAutoDeleteAt({ x: e.clientX, y: e.clientY })}>
              Автоудаление сообщений: {autoDeleteLabel(chat.autoDeleteSeconds)}
            </Row>
          ) : null}
        </div>

        <div className={styles.card}>
          {other ? (
            <>
              <Row icon="Lock" danger onClick={() => void actions.toggleBlock()}>
                {blocked ? "Разблокировать" : "Заблокировать"}
              </Row>
              <Row icon="Shield" danger onClick={() => setDialog({ kind: "report", target: { type: "user", id: other.id }, label: other.name })}>
                Пожаловаться
              </Row>
            </>
          ) : !isDm ? (
            <Row icon="Shield" danger onClick={() => setDialog({ kind: "report", target: { type: "chat", id: chat.id }, label: title })}>
              Пожаловаться на {kind}
            </Row>
          ) : null}
        </div>

        {!isDm && (chat.type !== "channel" || isAdmin) ? <Members chat={chat} members={members} meId={me.id} /> : null}
      </div>

      {autoDeleteAt ? (
        <Menu
          at={autoDeleteAt}
          label="Автоудаление сообщений"
          items={AUTO_DELETE_DURATIONS.map((d) => ({ label: d.label, onClick: () => void actions.setAutoDelete(d.seconds) }))}
          onClose={() => setAutoDeleteAt(null)}
        />
      ) : null}
      {dialog?.kind === "mute" ? <MuteDialog onMute={(opts) => void actions.mute(opts)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "report" ? <ReportDialog target={dialog.target} targetLabel={dialog.label} onClose={() => setDialog(null)} /> : null}
    </aside>
  );
}

function Row({ icon, danger, onClick, children }: { icon: IconName; danger?: boolean; onClick: (e: MouseEvent) => void; children: ReactNode }) {
  return (
    <button type="button" className={danger ? `${styles.row} ${styles.danger}` : styles.row} onClick={onClick}>
      <span className={styles.rowIcon}>
        <Icon name={icon} size={22} />
      </span>
      <span>{children}</span>
    </button>
  );
}

/** Телефон, @имя, о себе, день рождения, общие группы — то, что отдаёт приватность (DmProfileRows). */
function ProfileRows({ userId }: { userId: string }) {
  const profile = useQuery(userQueries.profile(userId)).data;
  if (!profile) return null;
  const u = profile.user;
  const groups = profile.commonGroupsCount;
  const rows = [
    u.phone ? <InfoRow key="phone" icon="Phone" value={u.phone} label="Телефон" copy={u.phone} /> : null,
    u.username ? <InfoRow key="username" icon="At" value={`@${u.username}`} label="Юзернейм" accent copy={`@${u.username}`} /> : null,
    u.bio ? <InfoRow key="bio" icon="Info" value={u.bio} label={u.isBot ? "Описание" : "О себе"} multiline /> : null,
    u.birthday ? (
      <InfoRow
        key="birthday"
        icon="Gift"
        value={isBirthdayToday(u.birthday) ? `🎉 Сегодня день рождения · ${birthdayText(u.birthday)}` : birthdayText(u.birthday)}
        label="День рождения"
      />
    ) : null,
    groups > 0 ? <InfoRow key="groups" icon="Users" value={`${groups} ${plural(groups, "общая группа", "общие группы", "общих групп")}`} label="Общие группы" /> : null,
  ].filter(Boolean);
  return rows.length ? <div className={styles.card}>{rows}</div> : null;
}

function Members({ chat, members, meId }: { chat: ChatSummary; members: readonly ChatMember[]; meId: string }) {
  return (
    <section className={styles.card} aria-label={chat.type === "channel" ? "Подписчики" : "Участники"}>
      <p className={styles.membersLabel}>
        {chat.type === "channel" ? "Подписчики" : "Участники"} ({members.length})
      </p>
      {sortMembers(chat, members).map((m) => {
        const role = memberRoleLabel(chat, m.id);
        const owner = isChatOwner(chat, m.id);
        const tone = typeof chat.memberTitles[m.id] === "string" && chat.memberTitles[m.id] ? "custom" : owner ? "owner" : chat.adminIds.includes(m.id) ? "admin" : "mod";
        const status = statusLabel(m);
        return (
          <div key={m.id} className={styles.member}>
            <Avatar size={42} name={m.name} color={m.avatarColor} image={m.avatarImage} online={m.online} />
            <span className={styles.memberText}>
              <span className={styles.memberName}>
                <span className={styles.ellipsis}>{m.name}</span>
                {role ? (
                  <span className={`${styles.tag} ${styles[tone]}`}>
                    {tone === "custom" ? null : <Icon name={owner ? "Crown" : "Shield"} size={11} />} {role}
                  </span>
                ) : null}
                {chat.restrictions[m.id] ? (
                  <span className={`${styles.tag} ${styles.restricted}`} title="Не может писать">
                    <Icon name="Lock" size={11} />
                  </span>
                ) : null}
              </span>
              <span className={status === "в сети" ? `${styles.memberStatus} ${styles.online}` : styles.memberStatus}>
                {m.id === meId ? "это вы" : (status ?? "был(а) недавно")}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
