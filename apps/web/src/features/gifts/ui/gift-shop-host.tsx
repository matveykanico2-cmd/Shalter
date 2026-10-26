import { useGiftShopRequest } from "@/entities/gift";

import { GiftShopDialog } from "./gift-shop-dialog";

/** Окно «Отправить подарок» в оболочке — открывают через openGiftShop из entities/gift. */
export function GiftShopHost() {
  const request = useGiftShopRequest();
  return request ? <GiftShopDialog key={request.id} request={request} /> : null;
}
