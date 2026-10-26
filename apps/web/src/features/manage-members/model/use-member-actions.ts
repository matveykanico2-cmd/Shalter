import { useQueryClient } from "@tanstack/react-query";

import { chatCache, type ChatMember, chatQueries, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, toast } from "@/shared/ui";

import { type MemberRole, restrictMember, setMemberRole, setMemberTitle } from "../api/members";

type Updated = Awaited<ReturnType<typeof setMemberRole>>["chat"];

/** Действия с участниками из панели — как handleMemberAction/handleRestrictMember/editTitle (public/js). */
export function useMemberActions(chat: ChatSummary, meId: string) {
  const client = useQueryClient();
  const kind = chat.type === "channel" ? "канала" : "группы";

  /** Роли — сразу, список участников — перезапросом карточки (как api.getChat после действия). */
  const apply = (updated: Updated) => {
    const { ownerId, ownerIds, adminIds, moderatorIds, memberTitles, memberIds, membersCount, restrictions, bannedIds } = updated;
    chatCache.patchChat(client, chat.id, { ownerId, ownerIds, adminIds, moderatorIds, memberTitles, memberIds, membersCount, restrictions, bannedIds });
    void client.invalidateQueries({ queryKey: chatQueries.card(chat.id).queryKey });
  };

  const role = async (member: ChatMember, next: MemberRole) => {
    try {
      apply((await setMemberRole(chat.id, member.id, next)).chat);
    } catch (err) {
      toast(errorText(err, "Не удалось изменить права"), { error: true });
    }
  };

  const makeOwner = async (member: ChatMember) => {
    if (await askConfirm(`Сделать ${member.name} владельцем чата? У него будут те же права, что у вас, включая назначение владельцев.`)) await role(member, "owner");
  };

  const transfer = async (member: ChatMember) => {
    const text = `Передать ${member.name} права владельца ${kind}? Вы останетесь администратором, но вернуть права сможет только новый владелец.`;
    if (await askConfirm(text, { danger: true })) await role(member, "transfer");
  };

  const ban = async (member: ChatMember) => {
    if (await askConfirm(`Заблокировать ${member.name}? Он будет удалён и не сможет вернуться, пока его не разблокируют.`, { danger: true })) await role(member, "ban");
  };

  const editTitle = async (member: ChatMember) => {
    const current = chat.memberTitles[member.id];
    const question =
      member.id === meId ? "Ваш тег в группе (виден всем, до 24 символов). Пусто — убрать." : `Тег для ${member.name} (виден всем, до 24 символов). Пусто — вернуть обычную роль.`;
    const next = await askText(question, { initial: typeof current === "string" ? current : "" });
    if (next === null) return;
    try {
      apply((await setMemberTitle(chat.id, member.id, next)).chat);
    } catch (err) {
      toast(errorText(err, "Не удалось изменить тег"), { error: true });
    }
  };

  const restrict = async (member: ChatMember, until: string | null) => {
    try {
      apply((await restrictMember(chat.id, member.id, until)).chat);
    } catch (err) {
      toast(errorText(err, "Не удалось изменить ограничение"), { error: true });
    }
  };

  /** По одному, как handleAddMember: кого не удалось — тостом, остальные добавлены. */
  const add = async (userIds: readonly string[]) => {
    let last: Updated | null = null;
    for (const userId of userIds) {
      try {
        last = (await setMemberRole(chat.id, userId, "add")).chat;
      } catch (err) {
        toast(errorText(err, "Не удалось добавить участника"), { error: true });
      }
    }
    if (last) apply(last);
  };

  return { role, makeOwner, transfer, ban, editTitle, restrict, add };
}
