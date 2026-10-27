// Запросы раздела «Администрирование» — admin*/grant*/reviewAd и прочие в public/js/api.js.
import type {
  adminSectionsBody,
  banBody,
  bulkDeleteBody,
  catalogItemBody,
  chatLookupBody,
  deleteUserBody,
  directoryChatsBody,
  directoryUsersBody,
  exportBody,
  exportsBody,
  labelBody,
  labelUserBody,
  lookupBody,
  mailStatusBody,
  moderationBody,
  pricing,
  pricingBody,
  pricingWithDefaultsBody,
  resetPasswordBody,
  serverStatsBody,
  userReportsBody,
  verifyUserBody,
} from "@shalter/shared/schemas/admin";
import type { reviewListBody } from "@shalter/shared/schemas/ads";
import type { donationStatusBody } from "@shalter/shared/schemas/donations";
import type { catalogBody, giftBody, shopBody } from "@shalter/shared/schemas/gifts";
import type { promoCodeBody, promoListBody } from "@shalter/shared/schemas/promotions";
import type { emojiBody, emojiListBody } from "@shalter/shared/schemas/stickers";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";
import type { CustomScene } from "@/shared/lib/anim";

export type Moderation = z.infer<typeof moderationBody>;
export type Report = Moderation["openReports"][number];
/** Карточка пользователя: что пришло из поиска, списков модерации или /users/:id/reports. */
export type AdminUser = { id: string; name: string; twoFactorEnabled?: boolean } & Partial<z.infer<typeof userReportsBody>["user"]>;
export type FoundUser = z.infer<typeof lookupBody>["user"];
export type FoundChat = z.infer<typeof chatLookupBody>["chat"];
export type DirectoryTab = "users" | "groups" | "channels" | "bots";
export type DirectoryItem = z.infer<typeof directoryUsersBody>["items"][number] | z.infer<typeof directoryChatsBody>["items"][number];
export type MailStatus = z.infer<typeof mailStatusBody>;
export type ServerStats = z.infer<typeof serverStatsBody>;
export type Pricing = z.infer<typeof pricing>;
export type ReviewList = z.infer<typeof reviewListBody>;
export type ReviewCampaign = ReviewList["campaigns"][number];
export type GiftCatalog = z.infer<typeof catalogBody>;
export type CatalogGift = GiftCatalog["gifts"][number];
export type CustomEmoji = z.infer<typeof emojiListBody>["emoji"][number];
export type PromoCode = z.infer<typeof promoListBody>["codes"][number];
export type PromoPrize = "premium" | "stars" | "ads" | "business";
export type NewPromoCode = {
  code?: string;
  prize: PromoPrize;
  config: { days: number } | { amount: number };
  usesTotal?: number | null;
};
export type ExportEntry = z.infer<typeof exportsBody>["exports"][number];
/** Срок выдачи: дней или навсегда. */
export type GrantTerm = { days: number } | { forever: true };

const baseKey = ["admin"] as const;
const q = encodeURIComponent;

export const adminQueries = {
  baseKey,
  moderation: () =>
    queryOptions({ queryKey: [...baseKey, "moderation"], queryFn: ({ signal }) => http.get<Moderation>("/api/admin/moderation", signal) }),
  userReports: (userId: string) =>
    queryOptions({
      queryKey: [...baseKey, "user-reports", userId],
      queryFn: ({ signal }) => http.get<z.infer<typeof userReportsBody>>(`/api/admin/users/${q(userId)}/reports`, signal),
    }),
  adReview: () => queryOptions({ queryKey: [...baseKey, "ad-review"], queryFn: ({ signal }) => http.get<ReviewList>("/api/ads/review", signal) }),
  server: () =>
    queryOptions({ queryKey: [...baseKey, "server"], queryFn: ({ signal }) => http.get<ServerStats>("/api/admin/server", signal) }),
  pricing: () =>
    queryOptions({
      queryKey: [...baseKey, "pricing"],
      queryFn: ({ signal }) => http.get<z.infer<typeof pricingWithDefaultsBody>>("/api/admin/pricing", signal),
      staleTime: 0,
    }),
  promotions: () =>
    queryOptions({
      queryKey: [...baseKey, "promotions"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof promoListBody>>("/api/promotions/admin", signal)).codes,
    }),
  exports: () =>
    queryOptions({
      queryKey: [...baseKey, "exports"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof exportsBody>>("/api/admin/exports", signal)).exports,
    }),
  donations: () =>
    queryOptions({
      queryKey: [...baseKey, "donations"],
      queryFn: ({ signal }) => http.get<z.infer<typeof donationStatusBody>>("/api/donation-alerts/status", signal),
    }),
  giftCatalog: () =>
    queryOptions({ queryKey: [...baseKey, "gift-catalog"], queryFn: ({ signal }) => http.get<GiftCatalog>("/api/gifts/catalog", signal) }),
  /** Витрина подарков — для «Отправить подарок» из карточки. */
  giftShop: () =>
    queryOptions({
      queryKey: [...baseKey, "gift-shop"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof shopBody>>("/api/gifts", signal)).gifts,
    }),
  emoji: () =>
    queryOptions({
      queryKey: [...baseKey, "custom-emoji"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof emojiListBody>>("/api/custom-emoji", signal)).emoji,
    }),
};

// ——— Поиск и каталог ———
export const lookupUser = (query: string) => http.get<z.infer<typeof lookupBody>>(`/api/admin/lookup?q=${q(query)}`);
export const lookupChat = (query: string) => http.get<z.infer<typeof chatLookupBody>>(`/api/admin/chats/lookup?q=${q(query)}`);
export const loadDirectory = (type: DirectoryTab, query: string) =>
  http.get<{ items: DirectoryItem[]; total: number }>(`/api/admin/directory?type=${q(type)}&q=${q(query)}`);
export const bulkDelete = (items: { id: string; kind: string }[], reason: string) =>
  http.post<z.infer<typeof bulkDeleteBody>>("/api/admin/moderation/delete", { items, reason });
export const deleteChat = (chatId: string, reason: string) => http.delete<unknown>(`/api/chats/${q(chatId)}`, { reason });
export const deleteBot = (botId: string, reason: string) => http.delete<unknown>(`/api/admin/bots/${q(botId)}`, { reason });
export const mailStatus = () => http.get<MailStatus>("/api/admin/mail-status");

// ——— Метки и статусы ———
type LabelFields = { short: string; label: string; hint: string; color: string };
export const createLabel = (label: LabelFields & { id: string }) => http.post<z.infer<typeof labelBody>>("/api/admin/labels", label);
export const updateLabel = (id: string, patch: LabelFields) => http.patch<z.infer<typeof labelBody>>(`/api/admin/labels/${q(id)}`, patch);
export const deleteLabel = (id: string) => http.delete<unknown>(`/api/admin/labels/${q(id)}`);
export const createStatus = (item: { image: string; name: string }) => http.post<z.infer<typeof catalogItemBody>>("/api/admin/status-catalog", item);
export const deleteStatus = (id: string) => http.delete<unknown>(`/api/admin/status-catalog/${q(id)}`);

// ——— Карточка пользователя ———
export const setBanned = (userId: string, banned: boolean, reason?: string, durationSec: number | null = null) =>
  http.post<z.infer<typeof banBody>>(`/api/admin/users/${q(userId)}/ban`, { banned, reason, durationSec });
export const setVerified = (userId: string, verified: boolean) =>
  http.post<z.infer<typeof verifyUserBody>>(`/api/admin/users/${q(userId)}/verify`, { verified });
export const setSafetyLabel = (userId: string, label: string) =>
  http.post<z.infer<typeof labelUserBody>>(`/api/admin/users/${q(userId)}/label`, { label });
export const setAdminSections = (userId: string, sections: string[]) =>
  http.post<z.infer<typeof adminSectionsBody>>(`/api/admin/users/${q(userId)}/admin-sections`, { sections });
export const deleteUser = (userId: string, confirm: string, reason: string) =>
  http.delete<z.infer<typeof deleteUserBody>>(`/api/admin/users/${q(userId)}`, { confirm, reason });
export const resetPassword = (userId: string, body: { password: string; confirm: string; reason: string; disableTwoFactor: boolean }) =>
  http.post<z.infer<typeof resetPasswordBody>>(`/api/admin/users/${q(userId)}/reset-password`, body);
/** Снять 2FA без сброса пароля; ответ — как у сброса пароля. */
export const disableTwoFactor = (userId: string, body: { confirm: string; reason: string }) =>
  http.post<z.infer<typeof resetPasswordBody>>(`/api/admin/users/${q(userId)}/disable-2fa`, body);

type GrantedUser = { user: Partial<AdminUser> & Record<string, unknown> };
export const grantPremium = (userId: string, premium: boolean, term?: GrantTerm) => http.post<GrantedUser>("/api/premium/grant", { userId, premium, ...term });
export const grantBusiness = (userId: string, business: boolean, term?: GrantTerm) => http.post<GrantedUser>("/api/business/grant", { userId, business, ...term });
export const grantAds = (userId: string, active: boolean, term?: GrantTerm) => http.post<GrantedUser>("/api/ads/grant", { userId, active, ...term });
export const grantStars = (userId: string, stars: number) => http.post<{ balance: number }>("/api/stars/grant", { userId, stars });
export const deliverGift = (giftId: string, recipientId: string) => http.post<unknown>("/api/gifts/deliver", { giftId, recipientId });
export const exportUser = (userId: string, reason: string) => http.post<z.infer<typeof exportBody>>("/api/admin/export", { userId, reason });

// ——— Реклама на проверке ———
export const reviewAd = (id: string, approve: boolean, reason: string) => http.post<unknown>(`/api/ads/review/${q(id)}`, { approve, reason });

// ——— Цены ———
export const updatePricing = (patch: Pricing) => http.put<z.infer<typeof pricingBody>>("/api/admin/pricing", patch);
export const resetPricing = () => http.delete<z.infer<typeof pricingBody>>("/api/admin/pricing");

// ——— Промокоды ———
export const createPromoCode = (body: NewPromoCode) => http.post<z.infer<typeof promoCodeBody>>("/api/promotions/admin/create", body);
export const updatePromoCode = (id: string, patch: { usesTotal: number | null }) =>
  http.patch<z.infer<typeof promoCodeBody>>(`/api/promotions/admin/${q(id)}`, patch);
export const deletePromoCode = (id: string) => http.delete<{ ok: true }>(`/api/promotions/admin/${q(id)}`);

// ——— Каталог подарков ———
export const setGiftSupply = (id: string, supply: number) => http.post<unknown>(`/api/gifts/catalog/${q(id)}/supply`, { supply });
export const setGiftScene = (id: string, scene: CustomScene | null) => http.post<unknown>(`/api/gifts/catalog/${q(id)}/scene`, { scene });
export const createGift = (gift: Record<string, unknown>) => http.post<z.infer<typeof giftBody>>("/api/gifts/catalog", gift);
export const deleteGift = (id: string) => http.delete<{ ok: true; hidden?: true; removed?: true }>(`/api/gifts/catalog/${q(id)}`);
export const restoreGift = (id: string) => http.post<unknown>(`/api/gifts/catalog/${q(id)}/restore`);

// ——— Эмодзи ———
export const createEmoji = (name: string, scene: CustomScene) => http.post<z.infer<typeof emojiBody>>("/api/custom-emoji", { name, scene });
export const updateEmoji = (id: string, scene: CustomScene) => http.patch<z.infer<typeof emojiBody>>(`/api/custom-emoji/${q(id)}`, { scene });
export const deleteEmoji = (id: string) => http.delete<unknown>(`/api/custom-emoji/${q(id)}`);
