// Варианты и права в окнах сообществ — как ADD_MODES, VISIBLE_OPTIONS, RIGHTS в communityEditor.js.
import type { AddMode, CommunityRights } from "@/entities/community";

export const TITLE_MAX = 128;

export const ADD_MODES: { value: AddMode; title: string; sub: string }[] = [
  { value: "all", title: "Все участники", sub: "Участники могут сами добавлять свои группы и каналы в сообщество." },
  { value: "admins", title: "Только администраторы", sub: "Чаты, предложенные участниками, добавляются после одобрения администратором." },
];

export const VISIBLE_OPTIONS = [
  { value: true, title: "Видимый", sub: "Чат видят все участники сообщества." },
  { value: false, title: "Скрытый", sub: "Чат видят только его участники и администраторы сообщества." },
];

export const RIGHTS: { key: keyof CommunityRights; title: string; sub: string }[] = [
  { key: "editInfo", title: "Изменение информации", sub: "Название, описание и фото сообщества" },
  { key: "editChats", title: "Изменение списка чатов", sub: "Добавлять, скрывать и убирать чаты, рассматривать заявки" },
  { key: "ban", title: "Удаление участников", sub: "Удалять пользователей из сообщества" },
  { key: "addAdmins", title: "Назначение администраторов", sub: "Добавлять новых администраторов" },
];

/** «Все права» / перечень включённых — rightsSummary. */
export function rightsSummary(rights: CommunityRights | null | undefined) {
  const on = RIGHTS.filter((r) => rights?.[r.key]);
  if (on.length === RIGHTS.length) return "Все права";
  return on.length ? on.map((r) => r.title.toLowerCase()).join(", ") : "Без прав";
}
