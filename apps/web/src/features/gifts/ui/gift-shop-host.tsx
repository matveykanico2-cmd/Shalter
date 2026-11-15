import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { giftQueries } from "@/entities/gift";
import { useGiftShopRequest } from "@/entities/gift";

import { GiftShopDialog } from "./gift-shop-dialog";

/** Окно «Отправить подарок» в оболочке — открывают через openGiftShop из entities/gift. */
export function GiftShopHost() {
  const client = useQueryClient();
  const request = useGiftShopRequest();

  // Магазин смонтирован вместе с оболочкой приложения, поэтому каталог можно
  // загрузить заранее. Открытие окна после этого не ждёт сетевой запрос.
  useEffect(() => {
    void Promise.allSettled([client.prefetchQuery(giftQueries.shop()), client.prefetchQuery(giftQueries.custom())]);
  }, [client]);

  return request ? <GiftShopDialog key={request.id} request={request} /> : null;
}
