import type { CommunityRight, CommunityRights } from "../model/domain.js";

// Права администраторов сообщества — как в server/data/communities.js.
export const RIGHTS: readonly CommunityRight[] = ["editInfo", "editChats", "ban", "addAdmins"];
export const ALL_RIGHTS: CommunityRights = { editInfo: true, editChats: true, ban: true, addAdmins: true };
export const DEFAULT_ADMIN_RIGHTS: CommunityRights = { editInfo: true, editChats: true, ban: true, addAdmins: false };
export const ADD_MODES = new Set(["all", "admins"]);

/** Ровно четыре права, каждое true/false. */
export function cleanRights(raw: unknown): CommunityRights {
  const src = (raw ?? undefined) as Partial<Record<CommunityRight, unknown>> | undefined;
  return { editInfo: !!src?.editInfo, editChats: !!src?.editChats, ban: !!src?.ban, addAdmins: !!src?.addAdmins };
}

/** Права из колонки rights; битая — права админа по умолчанию. */
export function parseRights(text: string | null | undefined): CommunityRights {
  try {
    return cleanRights(JSON.parse(text as string));
  } catch {
    return cleanRights(DEFAULT_ADMIN_RIGHTS);
  }
}
