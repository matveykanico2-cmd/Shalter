import { type MouseEvent, type ReactNode, useState } from "react";

import { BoostCard } from "@/features/boost-chat";
import { ChannelStats } from "@/features/channel-stats";
import { AUTO_DELETE_DURATIONS, autoDeleteLabel, MuteDialog, useChatActions } from "@/features/chat-actions";
import { EditChatPanel } from "@/features/edit-chat";
import { AdminGiftDialog } from "@/features/gifts";
import { AddMembersDialog, MemberControls } from "@/features/manage-members";
import { SimilarChannels } from "@/features/similar-channels";
import { useStaffActions } from "@/features/staff-actions";
import { ChannelStoryButton } from "@/features/stories";

import { type ChatMember, type ChatSummary, chatTitle, isChatAdmin, isChatMuted, isChatOwner, levelForPoints, memberRoleLabel } from "@/entities/chat";
import { openGiftShop } from "@/entities/gift";
import { ReportDialog, type ReportTarget } from "@/entities/report";
import type { SelfUser } from "@/entities/session";
import { openUserProfile, ProfileRows } from "@/entities/user";

import { statusLabel } from "@/shared/lib/presence";
import { publicUrl } from "@/shared/lib/public-link";
import { useEscape } from "@/shared/lib/use-escape";
import { Avatar, Icon, type IconName, InfoRow, Menu } from "@/shared/ui";

import { membersLine, sortMembers } from "../lib/members";

import styles from "./chat-info-panel.module.css";

type Props = { chat: ChatSummary; members: readonly ChatMember[]; me: SelfUser; onClose: () => void };

type Dialog = { kind: "mute" } | { kind: "report"; target: ReportTarget; label: string } | null;

/** «Информация о чате» справа (на телефоне — на весь экран) — как public/js/components/infoPanel.js. */
export function ChatInfoPanel({ chat, members, me, onClose }: Props) {
  const actions = useChatActions(chat, me.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [giftPicker, setGiftPicker] = useState(false);
  const [autoDeleteAt, setAutoDeleteAt] = useState<{ x: number; y: number } | null>(null);
  // Вместо информации — «Изменить группу/канал» или статистика канала.
  const [screen, setScreen] = useState<"info" | "edit" | "stats">("info");
  const staff = useStaffActions(chat);
  const isDm = chat.type === "dm";
  const other = isDm ? chat.otherUser : undefined;
  const title = chatTitle(chat);
  const isAdmin = isChatAdmin(chat, me.id);
  const muted = isChatMuted(chat);
  const blocked = !!other && me.blockedUserIds.includes(other.id);
  const kind = chat.type === "channel" ? "канал" : "группу";
  const status = other ? statusLabel(other) : null;
  const level = chat.type === "group" ? levelForPoints(chat.points) : 0;
  const isChannelAdmin = chat.type === "channel" && isAdmin;
  // Esc закрывает статистику и саму панель; правка ловит Esc сама.
  useEscape(screen === "stats" ? () => setScreen("info") : onClose, screen !== "edit");

  if (screen === "edit" && !isDm && isAdmin) {
    return (
      <aside className={styles.panel} aria-label={chat.type === "channel" ? "Изменить канал" : "Изменить группу"}>
        <ChannelStoryButton chatId={chat.id}>
          {(open, progress) => <EditChatPanel chat={chat} onClose={() => setScreen("info")} channelStory={{ open, progress }} />}
        </ChannelStoryButton>
      </aside>
    );
  }
  if (screen === "stats" && isChannelAdmin) {
    return (
      <aside className={styles.panel} aria-label="Статистика">
        <div className={`${styles.header} ${styles.subHeader}`}>
          <button type="button" className={styles.close} title="Назад" onClick={() => setScreen("info")}>
            <Icon name="ChevronLeft" size={22} />
          </button>
          <h2>Статистика</h2>
        </div>
        <div className={styles.body}>
          <ChannelStats chatId={chat.id} />
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Информация о чате">
      <div className={styles.header}>
        <h2>{isDm ? "Профиль" : chat.type === "channel" ? "Канал" : "Группа"}</h2>
        <button type="button" className={styles.close} title="Закрыть" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className={styles.body}>
        {/* В личке аватар с именем открывает полный профиль (как info-panel-avatar-row в infoPanel.js). */}
        <HeroBox className={styles.hero} onClick={other ? () => openUserProfile(other.id) : undefined}>
          <Avatar size={120} name={other?.name ?? title} color={other?.avatarColor ?? chat.avatarColor} image={other?.avatarImage ?? chat.avatarImage} />
          <p className={styles.title}>
            {other?.name ?? title}
            {(other ? other.isVerified : chat.isVerified) ? (
              <span className={styles.verified} title="Подтверждённый аккаунт">
                <Icon name="Verified" size={16} />
              </span>
            ) : null}
            {level > 0 ? (
              <span className={styles.levelBadge} title={`${chat.points} баллов`}>
                ★ Ур. {level}
              </span>
            ) : null}
          </p>
          {other ? (
            <p className={status === "в сети" ? `${styles.subtitle} ${styles.online}` : styles.subtitle}>{status ?? "был(а) недавно"}</p>
          ) : !isDm ? (
            <p className={styles.subtitle}>{membersLine(chat, members)}</p>
          ) : null}
        </HeroBox>

        {other ? <ProfileRows userId={other.id} className={styles.card} /> : null}
        {!isDm ? (
          <div className={styles.card}>
            <BoostCard chat={chat} me={me} />
          </div>
        ) : null}
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
          {!isDm && isAdmin ? (
            <Row icon="Edit" onClick={() => setScreen("edit")}>
              Редактировать {kind}
            </Row>
          ) : null}
          {!isDm && staff.isAdmin ? (
            <Row icon="Verified" onClick={() => void staff.toggleVerified()}>
              {chat.isVerified ? "Снять галочку верификации" : `Верифицировать ${kind}`}
            </Row>
          ) : null}
          {other && staff.isAdmin ? (
            <Row icon="Star" onClick={() => void staff.togglePremium()}>
              {other.isPremium ? "Забрать Shalter Premium" : "Выдать Shalter Premium (30 дней)"}
            </Row>
          ) : null}
          {/* Тот же магазин подарков, что и в профиле. */}
          {other && !other.isBot && other.id !== me.id ? (
            <Row icon="Gift" onClick={() => openGiftShop({ recipient: { id: other.id, name: other.name } })}>
              Отправить подарок
            </Row>
          ) : null}
          {other && staff.isAdmin ? (
            <Row icon="Shield" onClick={() => setGiftPicker(true)}>
              Выдать подарок (админ)
            </Row>
          ) : null}
          <Row icon={muted ? "Bell" : "BellOff"} onClick={() => (muted ? void actions.mute({ off: true }) : setDialog({ kind: "mute" }))}>
            {muted ? "Включить уведомления" : "Отключить уведомления"}
          </Row>
          {isChannelAdmin ? (
            <Row icon="BarChart" onClick={() => setScreen("stats")}>
              Статистика канала
            </Row>
          ) : null}
          {isDm || isAdmin ? (
            <Row icon="Clock" onClick={(e) => setAutoDeleteAt({ x: e.clientX, y: e.clientY })}>
              Автоудаление сообщений: {autoDeleteLabel(chat.autoDeleteSeconds)}
            </Row>
          ) : null}
        </div>

        {chat.type === "channel" ? <SimilarChannels chatId={chat.id} /> : null}

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
      {giftPicker && other ? <AdminGiftDialog userId={other.id} onClose={() => setGiftPicker(false)} /> : null}
      {dialog?.kind === "mute" ? <MuteDialog onMute={(opts) => void actions.mute(opts)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "report" ? <ReportDialog target={dialog.target} targetLabel={dialog.label} onClose={() => setDialog(null)} /> : null}
    </aside>
  );
}

function HeroBox({ className, onClick, children }: { className?: string; onClick?: () => void; children: ReactNode }) {
  return onClick ? (
    <button type="button" className={`${className} ${styles.heroButton}`} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
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

function Members({ chat, members, meId }: { chat: ChatSummary; members: readonly ChatMember[]; meId: string }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={styles.card} aria-label={chat.type === "channel" ? "Подписчики" : "Участники"}>
      <div className={styles.membersHeader}>
        <p className={styles.membersLabel}>
          {chat.type === "channel" ? "Подписчики" : "Участники"} ({members.length})
        </p>
        {isChatAdmin(chat, meId) ? (
          <button type="button" className={styles.close} title="Добавить участника" onClick={() => setAdding(true)}>
            <Icon name="Plus" size={15} />
          </button>
        ) : null}
      </div>
      {sortMembers(chat, members).map((m) => {
        const role = memberRoleLabel(chat, m.id);
        const owner = isChatOwner(chat, m.id);
        const tone = typeof chat.memberTitles[m.id] === "string" && chat.memberTitles[m.id] ? "custom" : owner ? "owner" : chat.adminIds.includes(m.id) ? "admin" : "mod";
        const status = statusLabel(m);
        return (
          <div key={m.id} className={styles.member}>
            {/* Аватар и имя — кнопка профиля, как info-panel-member-profile-btn. */}
            <button type="button" className={styles.memberProfile} onClick={() => openUserProfile(m.id)}>
            <Avatar size={42} name={m.name} color={m.avatarColor} image={m.avatarImage} online={m.online} />
            <span className={styles.memberText}>
              <span className={styles.memberName} translate="no">
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
            </button>
            <MemberControls chat={chat} member={m} meId={meId} />
          </div>
        );
      })}
      {adding ? <AddMembersDialog chat={chat} meId={meId} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}
