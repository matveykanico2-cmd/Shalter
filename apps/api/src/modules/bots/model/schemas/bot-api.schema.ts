import { z } from "zod";
import { optionalText, raw, requestBody, requestQuery, text } from "../../../../common/lib/zod.js";
import { isSafeUrl } from "../../../../legacy/legacy.js";
import { normalizeUsername } from "../../../users/lib/username.js";
import type { BotCommand } from "../domain.js";
import { validateAppUrl } from "../../lib/mini-app.js";

// Bot API, как server/routes/botApi.js. В схеме — только проверки, которые там идут первыми
// (до поиска чата, сообщения или пользователя); остальные с теми же текстами — в сервисах.
// chatId для отправки (sendBotMessage) и поля, которые server/ сравнивает или хранит как есть,
// остаются как пришли.

const MEDIA_GROUP_KINDS = ["image", "video", "file", "voice", "video-note"];
const APP_CODE_MAX = 200_000;
const LONG_POLL_MAX_SEC = 50;

/** Непустой текст (`text?.trim()` в server/); не строка — та же ошибка. */
const requiredText = (error: string) => z.string({ error }).refine((v) => !!v.trim(), { error });

/** Флаг: нет поля — fallback, иначе `!!значение`. */
const flag = (fallback: boolean) => raw().transform((v) => (v === undefined ? fallback : !!v));

/** Число в пределах; не число или 0 — fallback (`Number(x) || fallback`). */
const clampedNumber = (min: number, max: number, fallback: number) => raw().transform((v) => Math.min(max, Math.max(min, Number(v) || fallback)));

/** Конечное число (`Number(x)`), иначе ошибка. */
const finiteNumber = (error: string) =>
  raw().transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: error });
      return z.NEVER;
    }
    return n;
  });

/** Непустое значение (`if (!x)`) строкой не длиннее max. */
const requiredSliced = (error: string, max: number) =>
  raw()
    .refine((v) => !!v, { error })
    .transform((v) => String(v).slice(0, max));

/** Непустое значение строкой не длиннее max, иначе undefined. */
const optionalSliced = (max: number) => raw().transform((v) => (v ? String(v).slice(0, max) : undefined));

// --- Сообщения ---
export const updatesQuerySchema = requestQuery({
  after: text().transform((v) => v || "1970-01-01T00:00:00.000Z"),
  limit: clampedNumber(1, 200, 200),
  timeout: clampedNumber(0, LONG_POLL_MAX_SEC, 0),
});
export type UpdatesQueryDto = z.infer<typeof updatesQuerySchema>;

export const sendMessageSchema = requestBody({ chatId: raw(), text: raw(), keyboard: raw(), replyToId: raw(), visibleTo: raw() });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const editTextSchema = requestBody({ messageId: text(), text: requiredText("text is required") });
export type EditTextDto = z.infer<typeof editTextSchema>;

export const messageIdSchema = requestBody({ messageId: text() });
export type MessageIdDto = z.infer<typeof messageIdSchema>;

export const pinSchema = requestBody({ messageId: text(), pinned: flag(true) });
export type PinDto = z.infer<typeof pinSchema>;

export const chatActionSchema = requestBody({ chatId: text(), action: raw() });
export type ChatActionDto = z.infer<typeof chatActionSchema>;

/** Фото, документ, видео, голосовое, кружок: ссылка на файл и подпись. */
export const sendFileSchema = requestBody({
  chatId: raw(),
  url: raw()
    .superRefine((v, ctx) => {
      if (!v) ctx.addIssue({ code: "custom", message: "url is required" });
      else if (!isSafeUrl(v)) ctx.addIssue({ code: "custom", message: "Некорректная ссылка на файл" });
    })
    .transform((v) => v as string),
  caption: raw(),
  name: raw(),
  replyToId: raw(),
  durationSec: raw(),
});
export type SendFileDto = z.infer<typeof sendFileSchema>;

export const chatMessagesQuerySchema = requestQuery({
  chatId: text(),
  limit: clampedNumber(1, 200, 60),
  before: text().transform((v) => v || null),
  q: text().transform((v) => v.trim().toLowerCase()),
});
export type ChatMessagesQueryDto = z.infer<typeof chatMessagesQuerySchema>;

export const sendStickerSchema = requestBody({
  chatId: text(),
  emoji: requiredSliced("emoji is required", 8),
  name: optionalSliced(60),
  scene: optionalSliced(40),
  replyToId: raw(),
});
export type SendStickerDto = z.infer<typeof sendStickerSchema>;

export const sendPollSchema = requestBody({
  chatId: raw(),
  question: requiredText("question is required"),
  options: raw().transform((v, ctx) => {
    const list = (Array.isArray(v) ? (v as unknown[]) : [])
      .map((o) => String(o).slice(0, 120))
      .filter(Boolean)
      .slice(0, 8);
    if (list.length < 2) {
      ctx.addIssue({ code: "custom", message: "at least two options are required" });
      return z.NEVER;
    }
    return list;
  }),
  replyToId: raw(),
});
export type SendPollDto = z.infer<typeof sendPollSchema>;

export const sendReactionSchema = requestBody({ messageId: text(), emoji: requiredSliced("emoji is required", 8) });
export type SendReactionDto = z.infer<typeof sendReactionSchema>;

export const sendGameSchema = requestBody({ chatId: text(), gameId: text() });
export type SendGameDto = z.infer<typeof sendGameSchema>;

export const sendLocationSchema = requestBody({
  chatId: raw(),
  lat: finiteNumber("lat and lng are required"),
  lng: finiteNumber("lat and lng are required"),
  caption: raw(),
  replyToId: raw(),
});
export type SendLocationDto = z.infer<typeof sendLocationSchema>;

export const sendContactSchema = requestBody({ chatId: raw(), name: raw(), phone: raw(), userId: raw(), replyToId: raw() }).superRefine((dto, ctx) => {
  if (!dto.name && !dto.phone) ctx.addIssue({ code: "custom", message: "name or phone is required" });
});
export type SendContactDto = z.infer<typeof sendContactSchema>;

export const forwardSchema = requestBody({ messageId: text(), toChatId: text() });
export type ForwardDto = z.infer<typeof forwardSchema>;

export const messageIdQuerySchema = requestQuery({ messageId: text() });
export type MessageIdQueryDto = z.infer<typeof messageIdQuerySchema>;

export const editKeyboardSchema = requestBody({ messageId: text(), keyboard: raw() });
export type EditKeyboardDto = z.infer<typeof editKeyboardSchema>;

/** Текст и время проверяет сервис: сначала ищется чат. */
export const scheduleSchema = requestBody({ chatId: text(), text: raw(), sendAt: raw() });
export type ScheduleDto = z.infer<typeof scheduleSchema>;

export const cancelScheduledSchema = requestBody({ scheduledId: text() });
export type CancelScheduledDto = z.infer<typeof cancelScheduledSchema>;

export const publishPostSchema = requestBody({
  chatId: text(),
  text: raw().transform((v) => (v === undefined ? "" : String(v))),
  url: raw(),
});
export type PublishPostDto = z.infer<typeof publishPostSchema>;

/** Медиа без ссылки отбрасываются; ни одного — ошибка. */
export const mediaGroupSchema = requestBody({
  chatId: raw(),
  items: raw().transform((v, ctx) => {
    const list = (Array.isArray(v) ? (v as { url?: unknown; kind?: unknown; name?: unknown }[]) : [])
      .filter((i) => i && typeof i.url === "string" && i.url)
      .slice(0, 10)
      .map((i) => ({
        kind: MEDIA_GROUP_KINDS.includes(i.kind as string) ? (i.kind as string) : "image",
        url: i.url as string,
        name: String(i.name ?? i.kind ?? "file").slice(0, 120),
      }));
    if (!list.length) {
      ctx.addIssue({ code: "custom", message: "items is required" });
      return z.NEVER;
    }
    if (list.some((i) => !isSafeUrl(i.url))) {
      ctx.addIssue({ code: "custom", message: "Некорректная ссылка на файл" });
      return z.NEVER;
    }
    return list;
  }),
  caption: raw(),
  replyToId: raw(),
});
export type MediaGroupDto = z.infer<typeof mediaGroupSchema>;

export const copySchema = requestBody({ chatId: raw(), messageId: text() });
export type CopyDto = z.infer<typeof copySchema>;

export const messageToUserSchema = requestBody({
  username: text().transform((v) => v.replace(/^@/, "")),
  userId: raw().transform((v) => (v ? String(v) : undefined)),
  text: requiredText("text is required"),
  keyboard: raw(),
});
export type MessageToUserDto = z.infer<typeof messageToUserSchema>;

// --- Чаты ---
export const chatIdQuerySchema = requestQuery({ chatId: text(), userId: text(), channelId: text() });
export type ChatIdQueryDto = z.infer<typeof chatIdQuerySchema>;

/**
 * Действие админа над участником: бан, ограничение, повышение, заявка на вступление.
 * userId — как пришёл: server/ сравнивает его с id участников без приведения к строке.
 */
export const memberActionSchema = requestBody({
  chatId: text(),
  userId: raw(),
  minutes: clampedNumber(1, 43200, 60),
  admin: flag(true),
});
export type MemberActionDto = z.infer<typeof memberActionSchema>;

/** Название проверяет сервис: сначала ищется чат. */
export const chatTextSchema = requestBody({ chatId: text(), title: raw(), description: text() });
export type ChatTextDto = z.infer<typeof chatTextSchema>;

export const createGroupSchema = requestBody({
  title: requiredText("title is required"),
  memberIds: raw().transform((v) => (Array.isArray(v) ? (v as string[]) : [])),
});
export type CreateGroupDto = z.infer<typeof createGroupSchema>;

export const permissionsSchema = requestBody({ chatId: text(), permissions: raw() });
export type PermissionsDto = z.infer<typeof permissionsSchema>;

export const inviteLinkSchema = requestBody({ chatId: text(), revoke: flag(false) });
export type InviteLinkDto = z.infer<typeof inviteLinkSchema>;

export const createChannelSchema = requestBody({
  title: requiredText("title is required"),
  description: text().transform((v) => v.trim().slice(0, 300)),
  username: raw().transform((v) => (v ? normalizeUsername(v) : null)),
  isPublic: flag(false),
});
export type CreateChannelDto = z.infer<typeof createChannelSchema>;

export const discussionSchema = requestBody({
  channelId: text(),
  groupId: text(),
  action: raw().transform((v) => v ?? "create"),
  title: optionalText(),
});
export type DiscussionDto = z.infer<typeof discussionSchema>;

// --- Профиль бота ---
export const setCommandsSchema = requestBody({
  commands: raw().transform((v): BotCommand[] =>
    (Array.isArray(v) ? (v as { command?: unknown; description?: unknown }[]) : [])
      .filter((c) => c && typeof c.command === "string" && c.command.trim())
      .slice(0, 50)
      .map((c) => ({
        command: (c.command as string).trim().replace(/^\//, "").slice(0, 32),
        description: String(c.description ?? "").slice(0, 120),
      }))
  ),
});
export type SetCommandsDto = z.infer<typeof setCommandsSchema>;

/** Нет поля — не меняется; иначе строкой (null — «null», как в server/). */
const presentText = () => raw().transform((v) => (v === undefined ? undefined : String(v)));

export const setProfileSchema = requestBody({ name: presentText(), description: presentText() });
export type SetProfileDto = z.infer<typeof setProfileSchema>;

/** Чужие загрузки проверяет сервис: нужен прежний аватар. */
export const setAvatarSchema = requestBody({
  image: z.string({ error: "image is required (URL или data:-строка)" }).refine((v) => !v || isSafeUrl(v), { error: "Некорректная ссылка на файл" }),
});
export type SetAvatarDto = z.infer<typeof setAvatarSchema>;

/** Внешний адрес приложения; пустой — приложения нет (url: null). */
export const setWebAppSchema = requestBody({
  url: raw().transform((v, ctx) => {
    const checked = validateAppUrl(v);
    if (checked.error !== undefined) {
      ctx.addIssue({ code: "custom", message: checked.error });
      return z.NEVER;
    }
    return checked.url;
  }),
  name: text().transform((v) => v.trim().slice(0, 40)),
});
export type SetWebAppDto = z.infer<typeof setWebAppSchema>;

/** Своя страница приложения; без name остаётся прежнее название. */
export const setWebAppCodeSchema = requestBody({
  code: text().refine((v) => v.length <= APP_CODE_MAX, { error: "Страница длиннее 200 000 символов" }),
  name: optionalText(),
});
export type SetWebAppCodeDto = z.infer<typeof setWebAppCodeSchema>;

export const checkWebAppSchema = requestBody({ initData: raw() });
export type CheckWebAppDto = z.infer<typeof checkWebAppSchema>;

export const userQuerySchema = requestQuery({ userId: text() });
export type UserQueryDto = z.infer<typeof userQuerySchema>;

export const resolveUsernameQuerySchema = requestQuery({
  username: text()
    .transform((v) => v.trim().replace(/^@/, ""))
    .refine((v) => !!v, { error: "username is required" }),
});
export type ResolveUsernameQueryDto = z.infer<typeof resolveUsernameQuerySchema>;
