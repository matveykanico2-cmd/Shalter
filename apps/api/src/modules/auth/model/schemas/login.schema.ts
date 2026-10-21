import { z } from "zod";
import { optionalText, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";

export const loginEmailSchema = requestBody({ email: text(), password: text() });
export type LoginEmailDto = z.infer<typeof loginEmailSchema>;

export const registerEmailSchema = requestBody({
  name: text(),
  lastName: text(),
  email: text(),
  password: text(),
  phone: text(),
  username: text(),
  referralCode: text(),
  birthday: text(),
});
export type RegisterEmailDto = z.infer<typeof registerEmailSchema>;

export const switchAccountSchema = requestBody({ userId: text() });
export type SwitchAccountDto = z.infer<typeof switchAccountSchema>;

export const logoutSchema = requestBody({ uid: optionalText() });
export type LogoutDto = z.infer<typeof logoutSchema>;

export const qrConfirmSchema = requestBody({ token: text() });
export type QrConfirmDto = z.infer<typeof qrConfirmSchema>;

export const qrPollQuerySchema = requestQuery({ token: text() });
export type QrPollQuery = z.infer<typeof qrPollQuerySchema>;

export const codeStartSchema = requestBody({ phone: text() });
export type CodeStartDto = z.infer<typeof codeStartSchema>;

export const codeVerifySchema = requestBody({ phone: text(), code: text() });
export type CodeVerifyDto = z.infer<typeof codeVerifySchema>;

export const usernameQuerySchema = requestQuery({ u: text() });
export type UsernameQuery = z.infer<typeof usernameQuerySchema>;
