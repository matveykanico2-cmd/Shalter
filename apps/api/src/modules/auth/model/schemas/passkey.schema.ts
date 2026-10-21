import { z } from "zod";

// Ответ браузера (navigator.credentials) проверяет server/lib/webauthn.js сам — поля
// передаются ему как есть.
const webauthnBody = z.preprocess(
  (body) => (body && typeof body === "object" && !Array.isArray(body) ? body : {}),
  z.looseObject({})
);

export const passkeyRegisterFinishSchema = webauthnBody;
export type PasskeyRegisterFinishDto = z.infer<typeof passkeyRegisterFinishSchema>;

export const passkeyLoginFinishSchema = webauthnBody;
export type PasskeyLoginFinishDto = z.infer<typeof passkeyLoginFinishSchema>;
