import { z } from "zod";
import { optionalText, requestBody, text } from "../../../../common/lib/zod.js";

export const twoFactorSetupSchema = requestBody({ method: optionalText() });
export type TwoFactorSetupDto = z.infer<typeof twoFactorSetupSchema>;

export const cloudPasswordSchema = requestBody({ accountPassword: text(), currentPassword: text(), password: text(), hint: text() });
export type CloudPasswordDto = z.infer<typeof cloudPasswordSchema>;

export const twoFactorLoginSchema = requestBody({ ticket: text(), code: text() });
export type TwoFactorLoginDto = z.infer<typeof twoFactorLoginSchema>;
