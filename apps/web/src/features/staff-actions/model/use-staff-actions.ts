import { useQuery, useQueryClient } from "@tanstack/react-query";

import { chatCache, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { grantPremium, setChatVerified, staffQueries } from "../api/staff-actions";

/**
 * Пункты главного админа Shalter в информации о чате (isShalterAdmin в public/js/views/chatView.js):
 * галочка верификации группы или канала, Premium собеседнику.
 */
export function useStaffActions(chat: ChatSummary) {
  const client = useQueryClient();
  const isAdmin = !!useQuery(staffQueries.premium()).data?.isAdmin;

  const toggleVerified = async () => {
    try {
      const { chat: updated } = await setChatVerified(chat.id, !chat.isVerified);
      chatCache.patchChat(client, chat.id, { isVerified: updated.isVerified });
    } catch (err) {
      toast(errorText(err, "Не удалось изменить верификацию"), { error: true });
    }
  };

  const togglePremium = async () => {
    const other = chat.otherUser;
    if (!other) return;
    try {
      const { user } = await grantPremium(other.id, !other.isPremium);
      chatCache.patchChat(client, chat.id, { otherUser: { ...other, isPremium: user.isPremium } });
    } catch (err) {
      toast(errorText(err, "Не удалось изменить Premium"), { error: true });
    }
  };

  return { isAdmin, toggleVerified, togglePremium };
}
