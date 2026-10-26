import { useQuery } from "@tanstack/react-query";

import { plural } from "@/shared/lib/presence";
import { InfoRow } from "@/shared/ui";

import { userQueries } from "../api/user-queries";
import { birthdayText, isBirthdayToday } from "../lib/birthday";

/** Телефон, @имя, о себе, день рождения, общие группы — то, что отдаёт приватность (DmProfileRows). */
export function ProfileRows({ userId, className }: { userId: string; className?: string }) {
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
  return rows.length ? <div className={className}>{rows}</div> : null;
}
