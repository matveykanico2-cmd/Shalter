import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Поля как пришли: проверки и тексты ошибок — в сервисах, как в server/routes/ads.js.
export const adContentSchema = requestBody({ text: raw(), url: raw(), attachments: raw() });
export type AdContentDto = z.infer<typeof adContentSchema>;

export const grantAdsSchema = requestBody({ userId: raw(), active: raw(), days: raw(), forever: raw() });
export type GrantAdsDto = z.infer<typeof grantAdsSchema>;

export const campaignSchema = requestBody({
  title: raw(),
  text: raw(),
  url: raw(),
  imageUrl: raw(),
  placements: raw(),
  placement: raw(),
  cpmStars: raw(),
});
export type CampaignDto = z.infer<typeof campaignSchema>;

export const budgetSchema = requestBody({ stars: raw() });
export type BudgetDto = z.infer<typeof budgetSchema>;

export const campaignStatusSchema = requestBody({ status: raw() });
export type CampaignStatusDto = z.infer<typeof campaignStatusSchema>;

export const reviewSchema = requestBody({ approve: raw(), reason: raw() });
export type ReviewDto = z.infer<typeof reviewSchema>;

export const serveQuerySchema = requestQuery({ placement: raw(), owner: raw() });
export type ServeQuery = z.infer<typeof serveQuerySchema>;
