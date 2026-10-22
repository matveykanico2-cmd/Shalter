import type { backgroundJobs } from "../../db/schema.js";

export type BackgroundJobRow = typeof backgroundJobs.$inferSelect;

/** Задача, взятая в работу: payload уже разобран. */
export interface ClaimedJob {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;
