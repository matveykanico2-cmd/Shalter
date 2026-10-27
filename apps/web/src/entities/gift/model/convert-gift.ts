import type { QueryClient } from "@tanstack/react-query";

import { starsQueries } from "@/entities/stars/@x/gift";
import { userQueries } from "@/entities/user/@x/gift";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import { giftApi } from "../api/gift-api";
import { giftStars } from "../lib/gift-stars";

import type { MessageGift, ReceivedGift } from "./types";

/**
 * «Обменять на N ⭐» под подарком в ленте (convertGift в messageBubble.js): запись на полке
 * ищем по эмодзи и номеру — у сообщения своей ссылки на неё нет.
 */
export async function convertGift(gift: MessageGift, meId: string, client: QueryClient) {
  const stars = giftStars(gift);
  if (!(await askConfirm(`Обменять ${gift.emoji} «${gift.name}» на ${stars} ⭐? Подарок исчезнет с вашей полки.`, { okLabel: "Обменять" }))) return;
  try {
    const { user } = await client.fetchQuery({ ...userQueries.profile(meId), staleTime: 0 });
    const shelf = (user.giftsReceived ?? []) as ReceivedGift[];
    const entry = shelf
      .slice()
      .reverse()
      .find((g) => g.emoji === gift.emoji && (gift.serial == null || g.serial === gift.serial));
    if (!entry) {
      toast("Этот подарок уже не на полке", { error: true });
      return;
    }
    const res = await giftApi.convert(entry.id);
    toast(`Получено ${res.gained} ⭐. Баланс: ${res.balance} ⭐`);
    void client.invalidateQueries({ queryKey: starsQueries.baseKey });
    void client.invalidateQueries({ queryKey: userQueries.profile(meId).queryKey });
  } catch (err) {
    toast(errorText(err, "Не удалось обменять подарок"), { error: true });
  }
}
