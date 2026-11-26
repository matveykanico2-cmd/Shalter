import "server-only";
import nodemailer from "nodemailer";

const email = process.env.YANDEX_EMAIL?.trim();
const password = process.env.YANDEX_APP_PASSWORD?.trim();
const from = process.env.SMTP_FROM?.trim() || email;

export const mailConfigured = Boolean(email && password && from);

function transporter() {
  if (!email || !password) throw new Error("Yandex SMTP is not configured. Set YANDEX_EMAIL and YANDEX_APP_PASSWORD.");
  return nodemailer.createTransport({ host: "smtp.yandex.ru", port: 465, secure: true, auth: { user: email, pass: password } });
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!from) throw new Error("SMTP_FROM or YANDEX_EMAIL is required.");
  await transporter().sendMail({ from, to, subject, html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
}

export async function sendWelcomeEmail(to: string, name: string) {
  await sendMail(to, "Добро пожаловать в shalter", `<div style="font-family:Arial,sans-serif;max-width:560px"><h1>Добро пожаловать в shalter, ${escapeHtml(name || "друг")}!</h1><p>Ваш аккаунт создан. Теперь можно общаться, публиковать истории, вступать в сообщества и звонить.</p></div>`);
}

export async function sendPasswordResetEmail(to: string, url: string) {
  await sendMail(to, "Сброс пароля shalter", `<div style="font-family:Arial,sans-serif;max-width:560px"><h1>Сброс пароля</h1><p>Ссылка действует 30 минут.</p><p><a href="${escapeHtml(url)}">Изменить пароль</a></p><p>Если это были не вы, просто проигнорируйте письмо.</p></div>`);
}

export async function sendVerificationEmail(to: string, url: string) {
  await sendMail(to, "Подтвердите email в shalter", `<div style="font-family:Arial,sans-serif;max-width:560px"><h1>Подтвердите ваш email</h1><p>Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты.</p><p><a href="${escapeHtml(url)}">Подтвердить email</a></p><p>Ссылка действует 24 часа.</p></div>`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
