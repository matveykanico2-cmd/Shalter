import type { adAttachment, adsMe, adsRequestChat, budgetBody, campaignsBody, donationOrder, placementId, statsBody, userBody } from "@shalter/shared/schemas/ads";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type Campaigns = z.infer<typeof campaignsBody>;
export type Campaign = Campaigns["campaigns"][number];
export type Placement = z.infer<typeof placementId>;
export type AdAttachment = z.infer<typeof adAttachment>;
export type CampaignFields = { title: string; text: string; url: string; placements: Placement[]; cpmStars: number };

const id = encodeURIComponent;

export const adsQueries = {
  /** Кабинет: кампании, баланс звёзд, места показа (GET /api/ads/campaigns). */
  campaigns: () => queryOptions({ queryKey: ["ads", "campaigns"], queryFn: ({ signal }) => http.get<Campaigns>("/api/ads/campaigns", signal) }),
  /** Объявление на своей странице (GET /api/ads/me). */
  me: () => queryOptions({ queryKey: ["ads", "me"], queryFn: ({ signal }) => http.get<z.infer<typeof adsMe>>("/api/ads/me", signal) }),
};

export const createCampaign = (fields: CampaignFields) => http.post("/api/ads/campaigns", fields);
export const updateCampaign = (campaignId: string, fields: CampaignFields) => http.patch(`/api/ads/campaigns/${id(campaignId)}`, fields);
export const deleteCampaign = (campaignId: string) => http.delete(`/api/ads/campaigns/${id(campaignId)}`);
export const topUpCampaign = (campaignId: string, stars: number) => http.post<z.infer<typeof budgetBody>>(`/api/ads/campaigns/${id(campaignId)}/budget`, { stars });
export const setCampaignStatus = (campaignId: string, status: "review" | "active" | "paused") => http.post(`/api/ads/campaigns/${id(campaignId)}/status`, { status });
export const campaignStats = (campaignId: string) => http.get<z.infer<typeof statsBody>>(`/api/ads/campaigns/${id(campaignId)}/stats`);

export const requestAds = () => http.post<Partial<z.infer<typeof adsRequestChat>> & Partial<z.infer<typeof donationOrder>>>("/api/ads/request");
export const setAdContent = (text: string, url: string, attachments: AdAttachment[]) =>
  http.put<z.infer<typeof userBody>>("/api/ads/content", { text, url, attachments });
