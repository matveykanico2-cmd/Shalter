import { useState } from "react";

import { type ChatMember, type ChatSummary, isChatAdmin, isChatOwner } from "@/entities/chat";

import { ChoiceDialog, Icon, Menu, type MenuItem } from "@/shared/ui";

import { RESTRICT_DURATIONS, restrictUntil } from "../lib/restrict";
import { useMemberActions } from "../model/use-member-actions";

import styles from "./manage-members.module.css";

type Props = { chat: ChatSummary; member: ChatMember; meId: string };

/** Кнопка справа от участника: «Ещё» с его правами или «Мой тег» — как openMemberMenu в infoPanel.js. */
export function MemberControls({ chat, member, meId }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [restricting, setRestricting] = useState(false);
  const actions = useMemberActions(chat, meId);
  const iAmAdmin = isChatAdmin(chat, meId);
  const iAmOwner = isChatOwner(chat, meId);
  const isOwner = isChatOwner(chat, member.id);

  if (member.id === meId) {
    const ownTag = chat.type === "group" && (iAmAdmin || (chat.permissions as { setOwnTag?: boolean } | null)?.setOwnTag !== false);
    if (!ownTag) return null;
    return (
      <button type="button" className={styles.more} title="Мой тег" onClick={() => void actions.editTitle(member)}>
        <Icon name="Edit" size={14} />
      </button>
    );
  }
  if (!iAmAdmin || (isOwner && !iAmOwner)) return null;

  const items = isOwner ? ownerItems() : memberItems();

  function ownerItems(): MenuItem[] {
    const ownerCount = new Set([...chat.ownerIds, chat.ownerId].filter(Boolean)).size;
    const items: MenuItem[] = [{ icon: "Edit", label: "Изменить тег", onClick: () => void actions.editTitle(member) }];
    if (ownerCount > 1) items.push({ icon: "Users", label: "Снять права владельца", danger: true, onClick: () => void actions.role(member, "unowner") });
    if (!member.isBot) items.push(transferItem());
    return items;
  }

  function transferItem(): MenuItem {
    return { icon: "Crown", label: "Передать права владельца", danger: true, onClick: () => void actions.transfer(member) };
  }

  function memberItems(): MenuItem[] {
    const isAdmin = chat.adminIds.includes(member.id);
    const isModerator = chat.moderatorIds.includes(member.id);
    const items: MenuItem[] = [
      { icon: "Users", label: isAdmin ? "Снять права администратора" : "Сделать администратором", onClick: () => void actions.role(member, isAdmin ? "demote" : "promote") },
      { icon: "Shield", label: isModerator ? "Снять модератора" : "Сделать модератором", onClick: () => void actions.role(member, isModerator ? "unmod" : "mod") },
    ];
    if (iAmOwner) {
      items.push({ icon: "Crown", label: "Сделать владельцем", danger: true, onClick: () => void actions.makeOwner(member) });
      items.push({ icon: "Edit", label: "Изменить тег", onClick: () => void actions.editTitle(member) });
      if (!member.isBot) items.push(transferItem());
    } else if (!isAdmin) {
      items.push({ icon: "Edit", label: "Изменить тег", onClick: () => void actions.editTitle(member) });
    }
    items.push(
      chat.restrictions[member.id]
        ? { icon: "Check", label: "Разрешить писать", onClick: () => void actions.restrict(member, null) }
        : { icon: "Lock", label: "Запретить писать", onClick: () => setRestricting(true) }
    );
    items.push({ icon: "X", label: "Исключить из чата", danger: true, onClick: () => void actions.role(member, "kick") });
    items.push({ icon: "Lock", label: "Заблокировать", danger: true, onClick: () => void actions.ban(member) });
    return items;
  }

  return (
    <>
      <button type="button" className={styles.more} title="Действия с участником" aria-haspopup="menu" onClick={(e) => setAt({ x: e.clientX, y: e.clientY })}>
        <Icon name="More" size={15} />
      </button>
      {at ? <Menu at={at} label={member.name} items={items} onClose={() => setAt(null)} /> : null}
      {restricting ? (
        <ChoiceDialog
          title={`Запретить писать: ${member.name}`}
          choices={RESTRICT_DURATIONS.map((d) => ({ label: d.label, onClick: () => void actions.restrict(member, restrictUntil(d.hours)) }))}
          onClose={() => setRestricting(false)}
        />
      ) : null}
    </>
  );
}
