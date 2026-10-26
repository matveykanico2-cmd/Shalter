import { useState } from "react";
import { useNavigate } from "react-router";

import { findUserByUsername } from "../api/open-profile";

type Known = { id: string; username?: string | null };

/**
 * @имя в тексте сообщения — как mention-link в public/js/lib/formatText.js: участник
 * чата или найденный по нику — его профиль, иначе экран /u/имя (канал, группа, «не найдено»).
 */
export function useMentionProfile(me: Known, members: readonly Known[]) {
  const navigate = useNavigate();
  const [profileId, setProfileId] = useState<string | null>(null);
  const openMention = async (handle: string) => {
    const name = handle.replace(/^@/, "").toLowerCase();
    if (me.username?.toLowerCase() === name) return setProfileId(me.id);
    const member = members.find((u) => u.username?.toLowerCase() === name);
    if (member) return setProfileId(member.id);
    const user = await findUserByUsername(name).then(
      (r) => r.user,
      () => null
    );
    if (user) setProfileId(user.id);
    else void navigate(`/u/${name}`);
  };
  return { profileId, openMention, closeProfile: () => setProfileId(null) };
}
