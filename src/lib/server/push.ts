import "server-only";
import * as webpush from "web-push";
import { all, run } from "./db";

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@localhost";
export const pushConfigured = Boolean(publicKey && privateKey);
if (pushConfigured) webpush.setVapidDetails(subject, publicKey!, privateKey!);

export function vapidPublicKey() { return publicKey ?? null; }

export async function sendPush(userId: number, payload: { title: string; body: string; url?: string }) {
  if (!pushConfigured) return;
  const subscriptions = all<{ id: number; endpoint: string; p256dh: string; auth: string }>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload)); }
    catch (error) { const status = (error as { statusCode?: number }).statusCode; if (status === 404 || status === 410) run("DELETE FROM push_subscriptions WHERE id = ?", subscription.id); }
  }));
}
