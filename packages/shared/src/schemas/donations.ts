// Оплата через донат-сервисы: заказ с кодом (data/pendingOrders.js) и статус
// подключения DonationAlerts/DonatePay (routes/donationAlerts.js).
import { z } from "zod";

/** Ответ /request (звёзды, Premium, подарок), когда подключён донат-сервис: код для комментария к донату. */
export const donationOrderBody = z.strictObject({
  code: z.string().regex(/^SHP-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/),
  donationUrl: z.string(),
  provider: z.enum(["donationalerts", "donatepay"]),
  amountRub: z.number(),
});

/** GET /api/donation-alerts/status. */
export const donationStatusBody = z.strictObject({
  configured: z.boolean(),
  connected: z.boolean(),
  username: z.string().nullable(),
  donatePayConfigured: z.boolean(),
});

/** /request без донат-сервиса: заявка ушла админу в личку. */
export const requestToAdminBody = z.strictObject({ chatId: z.string(), adminPhone: z.string() });
