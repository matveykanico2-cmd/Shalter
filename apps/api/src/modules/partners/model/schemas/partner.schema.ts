import { z } from "zod";
import { requestBody } from "../../../../common/lib/zod.js";

export const partnerCreateSchema = requestBody({
  userId: z.string().min(1),
  username: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_]+$/, "только латиница, цифры и _"),
  name: z.string().min(1).max(64),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
});
export type PartnerCreateDto = z.infer<typeof partnerCreateSchema>;

export const partnerUpdateSchema = requestBody({
  username: z.string().min(1).max(32).regex(/^[a-zA-Z0-9_]+$/, "только латиница, цифры и _").optional(),
  name: z.string().min(1).max(64).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
});
export type PartnerUpdateDto = z.infer<typeof partnerUpdateSchema>;
