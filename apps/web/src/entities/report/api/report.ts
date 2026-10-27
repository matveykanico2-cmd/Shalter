import type { reportReason, resolveBody } from "@shalter/shared/schemas/reports";
import type { z } from "zod";

import { http } from "@/shared/api";

export type ReportReason = z.infer<typeof reportReason>;
export type ReportTarget = { type: "message" | "user" | "chat"; id: string };

export const submitReport = (target: ReportTarget, reason: ReportReason, details: string) =>
  http.post<unknown>("/api/reports", { targetType: target.type, targetId: target.id, reason, details });

export type ResolveAction = "delete" | "ban" | "dismiss";

/** Решение модератора по жалобе из сообщения-жалобы (POST /api/reports/:id/resolve). */
export const resolveReport = (reportId: string, action: ResolveAction, messageId: string) =>
  http.post<z.infer<typeof resolveBody>>(`/api/reports/${encodeURIComponent(reportId)}/resolve`, { action, messageId });
