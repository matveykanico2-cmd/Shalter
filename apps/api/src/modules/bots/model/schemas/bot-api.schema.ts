import { z } from "zod";
import { raw, requestBody, requestQuery } from "../../../../common/lib/zod.js";

// Bot API: поля как пришли — проверки и тексты ошибок в сервисах, как в server/routes/botApi.js.

// --- Сообщения ---
export const updatesQuerySchema = requestQuery({ after: raw(), limit: raw(), timeout: raw() });
export type UpdatesQueryDto = z.infer<typeof updatesQuerySchema>;

export const sendMessageSchema = requestBody({ chatId: raw(), text: raw(), keyboard: raw(), replyToId: raw(), visibleTo: raw() });
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const editTextSchema = requestBody({ messageId: raw(), text: raw() });
export type EditTextDto = z.infer<typeof editTextSchema>;

export const messageIdSchema = requestBody({ messageId: raw() });
export type MessageIdDto = z.infer<typeof messageIdSchema>;

export const pinSchema = requestBody({ messageId: raw(), pinned: raw() });
export type PinDto = z.infer<typeof pinSchema>;

export const chatActionSchema = requestBody({ chatId: raw(), action: raw() });
export type ChatActionDto = z.infer<typeof chatActionSchema>;

/** Фото, документ, видео, голосовое, кружок: ссылка на файл и подпись. */
export const sendFileSchema = requestBody({ chatId: raw(), url: raw(), caption: raw(), name: raw(), replyToId: raw(), durationSec: raw() });
export type SendFileDto = z.infer<typeof sendFileSchema>;

export const chatMessagesQuerySchema = requestQuery({ chatId: raw(), limit: raw(), before: raw(), q: raw() });
export type ChatMessagesQueryDto = z.infer<typeof chatMessagesQuerySchema>;

export const sendStickerSchema = requestBody({ chatId: raw(), emoji: raw(), name: raw(), scene: raw(), replyToId: raw() });
export type SendStickerDto = z.infer<typeof sendStickerSchema>;

export const sendPollSchema = requestBody({ chatId: raw(), question: raw(), options: raw(), replyToId: raw() });
export type SendPollDto = z.infer<typeof sendPollSchema>;

export const sendReactionSchema = requestBody({ messageId: raw(), emoji: raw() });
export type SendReactionDto = z.infer<typeof sendReactionSchema>;

export const sendGameSchema = requestBody({ chatId: raw(), gameId: raw() });
export type SendGameDto = z.infer<typeof sendGameSchema>;

export const sendLocationSchema = requestBody({ chatId: raw(), lat: raw(), lng: raw(), caption: raw(), replyToId: raw() });
export type SendLocationDto = z.infer<typeof sendLocationSchema>;

export const sendContactSchema = requestBody({ chatId: raw(), name: raw(), phone: raw(), userId: raw(), replyToId: raw() });
export type SendContactDto = z.infer<typeof sendContactSchema>;

export const forwardSchema = requestBody({ messageId: raw(), toChatId: raw() });
export type ForwardDto = z.infer<typeof forwardSchema>;

export const messageIdQuerySchema = requestQuery({ messageId: raw() });
export type MessageIdQueryDto = z.infer<typeof messageIdQuerySchema>;

export const editKeyboardSchema = requestBody({ messageId: raw(), keyboard: raw() });
export type EditKeyboardDto = z.infer<typeof editKeyboardSchema>;

export const scheduleSchema = requestBody({ chatId: raw(), text: raw(), sendAt: raw() });
export type ScheduleDto = z.infer<typeof scheduleSchema>;

export const cancelScheduledSchema = requestBody({ scheduledId: raw() });
export type CancelScheduledDto = z.infer<typeof cancelScheduledSchema>;

export const publishPostSchema = requestBody({ chatId: raw(), text: raw(), url: raw() });
export type PublishPostDto = z.infer<typeof publishPostSchema>;

export const mediaGroupSchema = requestBody({ chatId: raw(), items: raw(), caption: raw(), replyToId: raw() });
export type MediaGroupDto = z.infer<typeof mediaGroupSchema>;

export const copySchema = requestBody({ chatId: raw(), messageId: raw() });
export type CopyDto = z.infer<typeof copySchema>;

export const messageToUserSchema = requestBody({ username: raw(), userId: raw(), text: raw(), keyboard: raw() });
export type MessageToUserDto = z.infer<typeof messageToUserSchema>;

// --- Чаты ---
export const chatIdQuerySchema = requestQuery({ chatId: raw(), userId: raw(), channelId: raw() });
export type ChatIdQueryDto = z.infer<typeof chatIdQuerySchema>;

/** Действие админа над участником: бан, ограничение, повышение, заявка на вступление. */
export const memberActionSchema = requestBody({ chatId: raw(), userId: raw(), minutes: raw(), admin: raw() });
export type MemberActionDto = z.infer<typeof memberActionSchema>;

export const chatTextSchema = requestBody({ chatId: raw(), title: raw(), description: raw() });
export type ChatTextDto = z.infer<typeof chatTextSchema>;

export const createGroupSchema = requestBody({ title: raw(), memberIds: raw() });
export type CreateGroupDto = z.infer<typeof createGroupSchema>;

export const permissionsSchema = requestBody({ chatId: raw(), permissions: raw() });
export type PermissionsDto = z.infer<typeof permissionsSchema>;

export const inviteLinkSchema = requestBody({ chatId: raw(), revoke: raw() });
export type InviteLinkDto = z.infer<typeof inviteLinkSchema>;

export const createChannelSchema = requestBody({ title: raw(), description: raw(), username: raw(), isPublic: raw() });
export type CreateChannelDto = z.infer<typeof createChannelSchema>;

export const discussionSchema = requestBody({ channelId: raw(), groupId: raw(), action: raw(), title: raw() });
export type DiscussionDto = z.infer<typeof discussionSchema>;

// --- Профиль бота ---
export const setCommandsSchema = requestBody({ commands: raw() });
export type SetCommandsDto = z.infer<typeof setCommandsSchema>;

export const setProfileSchema = requestBody({ name: raw(), description: raw() });
export type SetProfileDto = z.infer<typeof setProfileSchema>;

export const setAvatarSchema = requestBody({ image: raw() });
export type SetAvatarDto = z.infer<typeof setAvatarSchema>;

export const setWebAppSchema = requestBody({ url: raw(), code: raw(), name: raw() });
export type SetWebAppDto = z.infer<typeof setWebAppSchema>;

export const checkWebAppSchema = requestBody({ initData: raw() });
export type CheckWebAppDto = z.infer<typeof checkWebAppSchema>;

export const userQuerySchema = requestQuery({ userId: raw(), username: raw() });
export type UserQueryDto = z.infer<typeof userQuerySchema>;
