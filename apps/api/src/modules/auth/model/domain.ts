import type { passkeys } from "../../db/schema.js";
import type { PasskeyPublicKey } from "../../../legacy/legacy.js";

export type PasskeyRow = typeof passkeys.$inferSelect;

export interface Passkey {
  id: string;
  userId: string;
  publicKey: PasskeyPublicKey | null;
  signCount: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | undefined;
}

/** Ответ на вход, когда нужен второй шаг: клиент спрашивает код и шлёт его с билетом в /2fa/login. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  ticket: string;
  expiresInSec: number;
  name: string;
  method: string;
  hint: string | null;
  scheduledDeletionAt: string | null;
}
