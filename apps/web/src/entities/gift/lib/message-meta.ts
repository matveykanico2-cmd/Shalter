// Прочитано, если сообщение видел кто-то кроме отправителя (как в entities/message/lib/message-meta).
export const isReadByOthers = (m: { readByIds: readonly string[]; senderId: string }) => m.readByIds.some((id) => id !== m.senderId);
