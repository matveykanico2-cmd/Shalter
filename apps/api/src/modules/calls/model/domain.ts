import type { calls, signals } from "../../db/schema.js";

export type CallRow = typeof calls.$inferSelect;
export type SignalRow = typeof signals.$inferSelect;

/** Звонок, как его отдаёт server/data/calls.js (rowToCall): участники — из call_participants. */
export interface Call {
  id: string;
  chatId: string;
  kind: string;
  direction: string | undefined;
  callerId: string;
  status: string;
  startedAt: string;
  durationSec: number;
  participantIds: string[];
  joinToken: string | undefined;
}

/** Новый звонок (createCall). */
export type NewCall = Omit<Call, "joinToken">;

/** Что меняет updateCall. */
export type CallPatch = Partial<Pick<Call, "status" | "durationSec">>;

/** Сигнал WebRTC от участника звонка — адресату. data — как прислал клиент. */
export interface SignalInput {
  callId: string;
  fromUserId: string;
  toUserId: string;
  kind: string;
  data: unknown;
}

export interface Signal extends SignalInput {
  id: string;
  seq: number;
  createdAt: string;
}
