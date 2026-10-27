import { businessDays, sanitizers, type Attachment } from "../../../legacy/legacy.js";
import { DEFAULT_SETTINGS } from "../../users/lib/settings.defaults.js";
import type { UserSettings } from "../../users/model/domain.js";

// Очистка того, что клиент присылает в PATCH /api/settings, — как server/routes/settings.js.

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const shortString = (max: number) => (v: unknown) => typeof v === "string" && v.length <= max;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

// Ключи, которые клиент может менять через PATCH, и проверка типа значения. Остальное —
// служебные ключи сервера (chatClears, hiddenChats, chatWallpapers, chatFlags, pinnedOrder,
// pinnedChannelIds, ai): их пишут свои эндпоинты. Неизвестный ключ или значение не того
// типа молча отбрасывается.
const CLIENT_KEYS: Record<string, (v: unknown) => boolean> = {
  theme: shortString(32),
  accent: shortString(32),
  reduceMotion: isBool,
  fontSize: (v) => typeof v === "number" && Number.isFinite(v) && v >= 12 && v <= 20,
  requirePasswordOnLaunch: isBool,
  notifications: isPlainObject,
  privacy: isPlainObject,
  chatWallpaper: shortString(64),
  chatWallpaperImage: (v) => v === null || typeof v === "string",
  homeWallpaper: isBool,
  translateLanguage: shortString(16),
  uiLanguage: shortString(16),
  autoDownload: isBool,
  voiceTranscription: isBool,
  holidays: isPlainObject,
  business: isPlainObject,
  appIcon: (v) => typeof v === "string" && /^[a-z0-9-]{1,32}$/.test(v),
  // Клиент только очищает черновики целиком; сами черновики пишет /api/chats/:id/draft.
  drafts: (v) => isPlainObject(v) && !Object.keys(v).length,
};

/** Только разрешённые клиенту ключи со значениями нужного типа. */
export function pickClientKeys(body: Record<string, unknown>): Partial<UserSettings> {
  const patch: Partial<UserSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (Object.hasOwn(CLIENT_KEYS, key) && CLIENT_KEYS[key]!(value)) patch[key] = value;
  }
  return patch;
}

/** notifications сливается с текущими: PATCH { sound } не стирает previewText; mutedChats пишут только настройки чата. */
export function mergeNotifications(patch: Record<string, unknown>, current: unknown): UserSettings["notifications"] {
  const next: Record<string, unknown> = { ...(isPlainObject(current) ? current : DEFAULT_SETTINGS.notifications) };
  for (const k of ["previewText", "sound"]) if (isBool(patch[k])) next[k] = patch[k];
  return next;
}

const HOLIDAY_DATE_RE = /^\d{2}-\d{2}$/;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function sanitizeHolidays(raw: Record<string, any>) {
  const disabled = Array.isArray(raw?.disabled)
    ? [...new Set(raw.disabled.filter((id: unknown) => typeof id === "string").slice(0, 200))]
    : [];
  const custom = (Array.isArray(raw?.custom) ? raw.custom : [])
    .slice(0, 50)
    .map((h: any) => {
      const date = String(h?.date ?? "");
      const title = String(h?.title ?? "").trim().slice(0, 80);
      if (!HOLIDAY_DATE_RE.test(date) || !title) return null;
      const [mm, dd] = date.split("-").map(Number) as [number, number];
      // Число месяца — с учётом месяца; 29 февраля допустимо (високосный 2000 год).
      if (mm < 1 || mm > 12 || dd < 1 || dd > new Date(Date.UTC(2000, mm, 0)).getUTCDate()) return null;
      return { id: typeof h.id === "string" && h.id ? h.id : newId("hol"), title, date };
    })
    .filter(Boolean);
  return { disabled, custom };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

function sanitizeHours(raw: any) {
  const defaults: Record<string, { closed: boolean; open: string; close: string }> = DEFAULT_SETTINGS.business.hours;
  const out: Record<string, { closed: boolean; open: string; close: string }> = {};
  for (const day of businessDays().DAY_KEYS) {
    // День, которого нет в запросе, — как по умолчанию (сб и вс — выходные), а не рабочий 09–18.
    const d = raw?.[day] ?? defaults[day];
    out[day] = {
      closed: !!d.closed,
      open: TIME_RE.test(d.open) ? d.open : "09:00",
      close: CLOSE_RE.test(d.close) ? d.close : "18:00",
    };
  }
  return out;
}

const oneAttachment = (raw: unknown): Attachment[] => (sanitizers().sanitizeAttachments(raw) ?? []).slice(0, 1);

function sanitizeQuickReplies(raw: unknown) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 50)
    .map((q) => {
      const text = String(q?.text ?? "").trim().slice(0, 1000);
      const attachments = oneAttachment(q?.attachments);
      if (!text && !attachments.length) return null;
      return {
        id: typeof q?.id === "string" && q.id ? q.id : newId("qr"),
        shortcut: String(q?.shortcut ?? "").trim().slice(0, 32),
        text,
        attachments,
      };
    })
    .filter(Boolean);
}

/** Бизнес-настройки заменяются целиком; включить их можно только с бизнес-подпиской. */
export function sanitizeBusiness(raw: Record<string, any>, isBusiness: boolean) {
  return {
    enabled: !!raw?.enabled && isBusiness,
    hours: sanitizeHours(raw?.hours),
    timeZone: businessDays().isValidTimeZone(raw?.timeZone) ? raw.timeZone : null,
    showHours: raw?.showHours !== false,
    greeting: {
      enabled: !!raw?.greeting?.enabled,
      text: String(raw?.greeting?.text ?? "").trim().slice(0, 500),
      attachments: oneAttachment(raw?.greeting?.attachments),
    },
    away: {
      enabled: !!raw?.away?.enabled,
      text: String(raw?.away?.text ?? "").trim().slice(0, 500),
      attachments: oneAttachment(raw?.away?.attachments),
    },
    quickReplies: sanitizeQuickReplies(raw?.quickReplies),
  };
}
