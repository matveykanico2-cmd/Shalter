import { useNavigate } from "react-router";

import { openUserProfile } from "@/entities/user";

import { findUserByUsername } from "../api/open-profile";

type Known = { id: string; username?: string | null };

/**
 * @имя в тексте сообщения — как mention-link в public/js/lib/formatText.js: участник
 * чата или найденный по нику — его профиль, иначе экран /@имя (канал, группа, «не найдено»).
 */
export function useMentionProfile(me: Known, members: readonly Known[]) {
  const navigate = useNavigate();
  const openMention = async (handle: string) => {
    const name = handle.replace(/^@/, "").toLowerCase();
    if (me.username?.toLowerCase() === name) return openUserProfile(me.id);
    const member = members.find((u) => u.username?.toLowerCase() === name);
    if (member) return openUserProfile(member.id);
    const user = await findUserByUsername(name).then(
      (r) => r.user,
      () => null
    );
    if (user) openUserProfile(user.id);
    else void navigate(`/@${name}`);
  };
  return { openMention, openProfile: openUserProfile };
}
