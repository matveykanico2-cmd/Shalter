import { route, jsonBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/admin";
import { mailConfigured, sendMail } from "@/lib/server/mailer";

export const GET = route(async () => { await requireAdmin(); return { configured: mailConfigured, host: "smtp.yandex.ru", port: 465, secure: true }; });

export const POST = route(async (req) => {
  const me = await requireAdmin();
  if (!mailConfigured) throw new HttpError(503, "Configure YANDEX_EMAIL and YANDEX_APP_PASSWORD first.");
  const body = await jsonBody<{ to?: string }>(req);
  const to = String(body.to ?? me.email).trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) throw new HttpError(400, "Enter a valid recipient email.");
  await sendMail(to, "Тестовая почта shalter", "<h1>Почта работает</h1><p>SMTP Яндекса успешно подключен к shalter.</p>");
  return { ok: true, to };
});
