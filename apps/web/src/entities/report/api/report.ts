import type { reportReason } from "@shalter/shared/schemas/reports";
import type { z } from "zod";

import { http } from "@/shared/api";

export type ReportReason = z.infer<typeof reportReason>;
export type ReportTarget = { type: "message" | "user" | "chat"; id: string };

export const submitReport = (target: ReportTarget, reason: ReportReason, details: string) =>
  http.post<unknown>("/api/reports", { targetType: target.type, targetId: target.id, reason, details });
