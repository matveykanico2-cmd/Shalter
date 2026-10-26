import type {
  chatSetupBody,
  passkeyAddedBody,
  passkeyRegisterStartBody,
  passkeysBody,
  remainingBody,
  totpSetupBody,
  twoFactorEnabledBody,
  twoFactorStatusBody,
} from "@shalter/shared/schemas/auth";
import type { blockBody, blockedListBody } from "@shalter/shared/schemas/users";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";
import { createPasskey } from "@/shared/lib/passkey";

export type TwoFactorStatus = z.infer<typeof twoFactorStatusBody>;
export type TwoFactorMethod = TwoFactorStatus["method"];
export type Passkey = z.infer<typeof passkeysBody>["passkeys"][number];
export type BlockedUser = z.infer<typeof blockedListBody>["users"][number];

const baseKey = ["privacy-settings"] as const;

export const privacyQueries = {
  baseKey,
  /** Включена ли 2FA и чем подтверждается вход (GET /api/auth/2fa). */
  twoFactor: () =>
    queryOptions({
      queryKey: [...baseKey, "2fa"],
      queryFn: ({ signal }) => http.get<TwoFactorStatus>("/api/auth/2fa", signal),
    }),
  /** Заблокированные (GET /api/users/blocked); кто именно в списке — по blockedUserIds сессии. */
  blocked: () =>
    queryOptions({
      queryKey: [...baseKey, "blocked"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof blockedListBody>>("/api/users/blocked", signal)).users,
    }),
  /** Ключи доступа аккаунта (GET /api/auth/passkeys). */
  passkeys: () =>
    queryOptions({
      queryKey: [...baseKey, "passkeys"],
      queryFn: async ({ signal }) => (await http.get<z.infer<typeof passkeysBody>>("/api/auth/passkeys", signal)).passkeys,
    }),
};

export const unblockUser = (userId: string) => http.post<z.infer<typeof blockBody>>(`/api/users/${encodeURIComponent(userId)}/block`, { blocked: false });

export async function addPasskey() {
  const opts = await http.post<z.infer<typeof passkeyRegisterStartBody>>("/api/auth/passkey/register/start");
  return http.post<z.infer<typeof passkeyAddedBody>>("/api/auth/passkey/register/finish", await createPasskey(opts));
}
export const deletePasskey = (id: string) => http.delete<unknown>(`/api/auth/passkeys/${encodeURIComponent(id)}`);

export const setupTwoFactor = (method: "totp" | "chat") =>
  http.post<z.infer<typeof totpSetupBody> | z.infer<typeof chatSetupBody>>("/api/auth/2fa/setup", { method });
export const sendTwoFactorCode = () => http.post<unknown>("/api/auth/2fa/send-code", {});
export const enableTwoFactor = (code: string) => http.post<z.infer<typeof twoFactorEnabledBody>>("/api/auth/2fa/enable", { code });
export const disableTwoFactor = (code: string) => http.post<unknown>("/api/auth/2fa/disable", { code });
export const setCloudPassword = (body: { password: string; hint: string; accountPassword: string }) =>
  http.post<unknown>("/api/auth/2fa/cloud-password", body);

export const changePassword = (currentPassword: string, newPassword: string) =>
  http.post<unknown>("/api/auth/change-password", { currentPassword, newPassword });
export const startEmailChange = (password: string, email: string) => http.post<{ email?: string }>("/api/auth/email/start", { password, email });
export const confirmEmailChange = (code: string) => http.post<{ user?: { email?: string } | null }>("/api/auth/email/verify", { code });

export const deleteAccount = (password: string) => http.post<z.infer<typeof remainingBody>>("/api/auth/delete-account", { password });

/** Выгрузка своих данных (GET /api/export): JSON и список вложений. */
export const exportData = () => http.get<{ data?: { media?: { url?: unknown; name?: string }[] } }>("/api/export");
