// Контакты как в Telegram — public/js/lib/contactSync.js: кто из телефонной книги уже в Shalter,
// сразу в контакты, без «Добавить» у каждого. Книгу целиком читает только нативное приложение
// (плагин @capacitor-community/contacts), в браузере её нет.
import { addContact, matchContacts, type MatchFound, type PhoneEntry } from "../api/contacts";

const CHUNK = 500;

type PermissionState = { contacts: string };
type ContactsPlugin = {
  checkPermissions: () => Promise<PermissionState>;
  requestPermissions: () => Promise<PermissionState>;
  getContacts: (opts: { projection: { name: boolean; phones: boolean } }) => Promise<{
    contacts?: { name?: { display?: string; given?: string; family?: string }; phones?: { number?: string }[] }[];
  }>;
};
type CapacitorWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Contacts?: ContactsPlugin } } };

function contactsPlugin() {
  const cap = (window as CapacitorWindow).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.Contacts ?? null) : null;
}

export const canReadPhoneBook = () => !!contactsPlugin();

/** Вся телефонная книга; разрешение спрашивает сама система (один раз). */
export async function readPhoneBook({ prompt = true } = {}): Promise<PhoneEntry[]> {
  const plugin = contactsPlugin();
  if (!plugin) return [];
  let { contacts: state } = await plugin.checkPermissions();
  if (state !== "granted" && state !== "limited" && prompt) ({ contacts: state } = await plugin.requestPermissions());
  if (state !== "granted" && state !== "limited") throw new Error("Нет доступа к контактам — разрешите его в настройках Android для Shalter.");
  const { contacts } = await plugin.getContacts({ projection: { name: true, phones: true } });
  const out: PhoneEntry[] = [];
  for (const c of contacts ?? []) {
    const name = c.name?.display ?? [c.name?.given, c.name?.family].filter(Boolean).join(" ");
    for (const p of c.phones ?? []) if (p?.number) out.push({ name: name ?? "", phone: String(p.number) });
  }
  return out;
}

export type SyncedFound = MatchFound & { justAdded?: boolean };

/** Сверить номера с сервером (пачками) и добавить в контакты всех найденных, кого ещё нет. */
export async function matchAndAddAll(entries: PhoneEntry[]) {
  const found: SyncedFound[] = [];
  const notFound: PhoneEntry[] = [];
  let checked = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const res = await matchContacts(entries.slice(i, i + CHUNK));
    found.push(...res.found);
    notFound.push(...res.notFound);
    checked += res.checked;
  }
  let added = 0;
  for (const entry of found) {
    if (entry.alreadyContact) continue;
    try {
      await addContact(entry.user.id, entry.localName || null);
      entry.justAdded = true;
      added++;
    } catch {
      // Не добавился один — остальных всё равно добавляем.
    }
  }
  return { found, notFound, checked, added };
}
