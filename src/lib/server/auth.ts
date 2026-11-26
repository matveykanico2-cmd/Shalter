import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { all, get, run, now } from "./db";
import { HttpError } from "./http";

export const SESSION_COOKIE = "sg_session";
export const ACCOUNT_COOKIE = "sg_accounts";
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export type UserRow = {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  name: string;
  last_name: string;
  bio: string;
  website: string;
  avatar: string | null;
  verified: number;
  private_account: number;
  show_activity: number;
  allow_messages: number;
  created_at: number;
};

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, userId, now());
  const store = await cookies();
  const tokens = readAccountTokens(store.get(ACCOUNT_COOKIE)?.value);
  if (!tokens.includes(token)) tokens.unshift(token);
  store.set(ACCOUNT_COOKIE, JSON.stringify(tokens.slice(0, 8)), cookieOptions());
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE };
}

function readAccountTokens(raw: string | undefined): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  const tokens = readAccountTokens(store.get(ACCOUNT_COOKIE)?.value).filter((x) => x !== token);
  if (tokens.length) store.set(ACCOUNT_COOKIE, JSON.stringify(tokens), cookieOptions());
  else store.delete(ACCOUNT_COOKIE);
  store.delete(SESSION_COOKIE);
}

export async function switchSession(userId: number) {
  const store = await cookies();
  const token = readAccountTokens(store.get(ACCOUNT_COOKIE)?.value).find((candidate) =>
    get<{ user_id: number }>("SELECT user_id FROM sessions WHERE token = ?", candidate)?.user_id === userId,
  );
  if (!token) throw new HttpError(404, "This account is not connected to this browser.");
  store.set(SESSION_COOKIE, token, cookieOptions());
}

export async function connectedAccounts() {
  const store = await cookies();
  const tokens = readAccountTokens(store.get(ACCOUNT_COOKIE)?.value);
  if (!tokens.length) return [];
  const marks = tokens.map(() => "?").join(",");
  return all<UserRow>(
    `SELECT u.id, u.username, u.email, u.phone, u.name, u.last_name, u.bio, u.website, u.avatar, u.verified, u.private_account, u.show_activity, u.allow_messages, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token IN (${marks})`,
    ...tokens,
  );
}

export async function currentUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (
    get<UserRow>(
      `SELECT u.id, u.username, u.email, u.phone, u.name, u.last_name, u.bio, u.website, u.avatar, u.verified, u.private_account, u.show_activity, u.allow_messages, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      token,
    ) ?? null
  );
}

export async function requireUser(): Promise<UserRow> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "You need to log in.");
  return user;
}

export const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
