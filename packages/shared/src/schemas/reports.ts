// Жалобы (server/routes/reports.js) и обращения в поддержку/к партнёрской
// программе (server/routes/support.js, server/routes/partners.js).
import { z } from "zod";
import { genId, isoDate } from "./common";

export const reportReason = z.enum(["spam", "scam", "fake", "violence", "terrorism", "extremism", "drugs", "illegal", "child_safety", "other"]);

/** POST /api/reports — строка reports как есть. */
export const report = z.strictObject({
  id: genId("rp"),
  reporterId: z.string(),
  targetType: z.enum(["user", "chat", "message"]),
  targetId: z.string(),
  subjectUserId: z.string().nullable(),
  reason: reportReason,
  details: z.string(),
  createdAt: isoDate,
  status: z.literal("open"),
});
export const reportBody = z.strictObject({ report });

export const reportStatus = z.enum(["open", "dismissed", "resolved_deleted", "resolved_banned"]);
export const resolveBody = z.strictObject({ status: reportStatus.exclude(["open"]) });

/** message.report у уведомления о жалобе в чате с системным ботом. */
export const reportCard = z.strictObject({
  reportId: genId("rp"),
  reason: reportReason,
  reporterName: z.string(),
  targetType: z.enum(["user", "chat", "message"]),
  targetSummary: z.string(),
  status: reportStatus,
  canBan: z.boolean(),
});

/** POST /api/support/chat, /api/support/report, /api/partners/chat */
export const chatIdBody = z.strictObject({ chatId: genId("c") });

/** GET /api/partners/me */
export const partnerInfoBody = z.strictObject({ tariffText: z.string() });
