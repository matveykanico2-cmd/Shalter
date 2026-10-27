import type { communities, communityMembers } from "../../db/schema.js";

export type CommunityRow = typeof communities.$inferSelect;
export type CommunityMemberRow = typeof communityMembers.$inferSelect;

/** Права администратора сообщества (как в tweb: AdminEditInfo / EditChats / BanMembers / AddAdmins). */
export interface CommunityRights {
  editInfo: boolean;
  editChats: boolean;
  ban: boolean;
  addAdmins: boolean;
}
export type CommunityRight = keyof CommunityRights;

export type CommunityRole = "owner" | "admin" | "member";

/** Сообщество — rowToCommunity в server/data/communities.js. */
export interface Community {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  avatarColor?: string;
  avatarImage?: string;
  addMode: "all" | "admins";
  createdAt: string;
  chatIds: string[];
  /** Скрытые чаты остаются в сообществе, но видны только своим участникам и админам. */
  hiddenChatIds: string[];
  /** Кто добавил чат: chatId → userId. */
  addedBy: Record<string, string>;
}

export interface CommunityPatch {
  title?: string;
  description?: string;
  avatarImage?: string | null;
  addMode?: string;
}

/** Заявка на добавление чата в сообщество в режиме «только админы». */
export interface CommunityRequest {
  id: string;
  communityId: string;
  chatId: string;
  suggestedBy: string;
  visible: boolean;
  createdAt: string;
}

export interface CommunityBan {
  userId: string;
  bannedBy: string | null;
  bannedAt: string;
}
