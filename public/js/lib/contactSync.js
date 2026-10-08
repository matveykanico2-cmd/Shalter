// Контакты как в Telegram: кто из телефонной книги уже в Shalter — сразу в контакты,
// без кнопки «Добавить» у каждого. В Android-приложении книга читается целиком
// (плагин @capacitor-community/contacts) и сверяется сама при запуске.
import { api } from "../api.js";
import { setState } from "../state.js";

const CHUNK = 500;
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = "shalter.contactSyncAt";

function contactsPlugin() {
  const cap = window.Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.Contacts ?? null : null;
}

export function canReadPhoneBook() {
  return !!contactsPlugin();
}

// Вся телефонная книга: [{ name, phone }]. Разрешение спрашивает сама система (один раз).
export async function readPhoneBook({ prompt = true } = {}) {
  const plugin = contactsPlugin();
  if (!plugin) return [];
  let { contacts: state } = await plugin.checkPermissions();
  if (state !== "granted" && state !== "limited" && prompt) ({ contacts: state } = await plugin.requestPermissions());
  if (state !== "granted" && state !== "limited") throw new Error("Нет доступа к контактам — разрешите его в настройках Android для Shalter.");
  const { contacts } = await plugin.getContacts({ projection: { name: true, phones: true } });
  const out = [];
  for (const c of contacts ?? []) {
    const name = c.name?.display ?? [c.name?.given, c.name?.family].filter(Boolean).join(" ");
    for (const p of c.phones ?? []) if (p?.number) out.push({ name: name ?? "", phone: String(p.number) });
  }
  return out;
}

// Сверить номера с сервером и добавить в контакты всех найденных, кого ещё нет.
// Возвращает { found, notFound, checked, added }.
export async function matchAndAddAll(entries) {
  const found = [];
  const notFound = [];
  let checked = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const res = await api.matchContacts(entries.slice(i, i + CHUNK));
    found.push(...res.found);
    notFound.push(...res.notFound);
    checked += res.checked;
  }
  let added = 0;
  for (const entry of found) {
    if (entry.alreadyContact) continue;
    try {
      await api.addContact(entry.user.id, entry.localName || null);
      entry.justAdded = true;
      added++;
    } catch {}
  }
  if (added) {
    api.getContactIds().then((r) => setState({ contactIds: r.ids })).catch(() => {});
    api.listChats().then((r) => setState({ chats: r.chats })).catch(() => {});
  }
  return { found, notFound, checked, added };
}

// При запуске Android-приложения: тихо подтянуть новых людей из книги (не чаще раза в 6 ч).
export async function autoSyncPhoneBook() {
  if (!contactsPlugin()) return;
  try {
    const last = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
    if (Date.now() - last < SYNC_EVERY_MS) return;
  } catch {}
  const entries = await readPhoneBook({ prompt: true });
  if (!entries.length) return;
  await matchAndAddAll(entries);
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {}
}
