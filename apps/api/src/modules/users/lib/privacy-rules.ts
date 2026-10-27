import type { ContactRow, UserSettings } from "../model/domain.js";

// Правила приватности без доступа к данным — как в server/lib/privacyRules.js
// (privacy-rules.spec.ts сверяет с ним). Чтение настроек и контактов — UserPrivacyService.

type Privacy = UserSettings["privacy"];

const LEVELS = new Set(["everyone", "contacts", "nobody"]);

// Как в DEFAULT_SETTINGS.privacy: отсутствующий ключ не должен открывать больше, чем умолчание.
const DEFAULT_LEVELS: Record<string, string> = { phone: "contacts", storiesArchive: "nobody" };
const defaultLevelFor = (key: string): string => DEFAULT_LEVELS[key] ?? "everyone";

export const PRIVACY_KEYS = [
  "lastSeen",
  "phone",
  "discoverByPhone",
  "photo",
  "bio",
  "birthday",
  "forwards",
  "invites",
  "calls",
  "messages",
  "botMessages",
  "storiesArchive",
] as const;

const MAX_PER_LIST = 200;

function idsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !id) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_PER_LIST) break;
  }
  return out;
}

/** Исключения правила key: кому всегда показывать и кому никогда. */
export function exceptionsFor(privacy: Privacy, key: string): { allow: string[]; deny: string[] } {
  const raw = privacy?.exceptions?.[key];
  return { allow: idsOf(raw?.allow), deny: idsOf(raw?.deny) };
}

/** Исключения без дублей, чужих ключей и пустых списков; deny важнее allow. */
export function normalizePrivacy<T extends Privacy>(privacy: T): T {
  if (!privacy || typeof privacy !== "object") return privacy;
  const next: NonNullable<Privacy> = { ...privacy };
  delete next.exceptions;
  const raw = privacy.exceptions;
  if (!raw || typeof raw !== "object") return next as T;
  const exceptions: Record<string, { allow: string[]; deny: string[] }> = {};
  for (const key of PRIVACY_KEYS) {
    const { allow, deny } = exceptionsFor({ exceptions: raw }, key);
    const cleanAllow = allow.filter((id) => !deny.includes(id));
    if (cleanAllow.length || deny.length) exceptions[key] = { allow: cleanAllow, deny };
  }
  if (Object.keys(exceptions).length) next.exceptions = exceptions;
  return next as T;
}

/** Уровень правила key, если исключения про зрителя ничего не говорят. */
function levelOf(privacy: Privacy, key: string): string {
  const level = privacy?.[key];
  return typeof level === "string" && LEVELS.has(level) ? level : defaultLevelFor(key);
}

/** Пускает ли правило key этого зрителя. */
export function privacyAllows(privacy: Privacy, key: string, viewerId: string | undefined, isContact: boolean): boolean {
  const { allow, deny } = exceptionsFor(privacy, key);
  if (viewerId && deny.includes(viewerId)) return false;
  if (viewerId && allow.includes(viewerId)) return true;
  const level = levelOf(privacy, key);
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  return !!isContact;
}

/** Как privacyAllows, но контакт ли зритель, узнаётся только если это решает дело. */
export function privacyAllowsLazy(privacy: Privacy, key: string, viewerId: string, isContact: () => boolean): boolean {
  const { allow, deny } = exceptionsFor(privacy, key);
  if (deny.includes(viewerId)) return false;
  if (allow.includes(viewerId)) return true;
  const level = levelOf(privacy, key);
  if (level === "everyone") return true;
  if (level === "nobody") return false;
  return isContact();
}

/**
 * Как в Telegram: у себя в контактах человек подписан вашим именем для него — везде.
 * Имя из профиля — в profileName. inContacts — он у вас в контактах, mutualContact — и вы у него.
 */
export function applyContactName<T extends { name?: unknown; inContacts?: boolean; mutualContact?: boolean; profileName?: unknown }>(
  visible: T,
  myContact: ContactRow | null | undefined,
  theyHaveMe: boolean
): T {
  visible.inContacts = !!myContact || undefined;
  visible.mutualContact = (!!myContact && theyHaveMe) || undefined;
  const localName = myContact?.localName?.trim();
  if (localName && localName !== visible.name) {
    visible.profileName = visible.name;
    visible.name = localName;
  }
  return visible;
}
