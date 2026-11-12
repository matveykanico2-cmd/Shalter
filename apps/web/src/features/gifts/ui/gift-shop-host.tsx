import { lazy, Suspense } from "react";

import { useGiftShopRequest } from "@/entities/gift";

// Магазин — отдельным чанком: на старте он не нужен.
const GiftShopDialog = lazy(() => import("./gift-shop-dialog").then((m) => ({ default: m.GiftShopDialog })));

/** Окно «Отправить подарок» в оболочке — открывают через openGiftShop из entities/gift. */
export function GiftShopHost() {
  const request = useGiftShopRequest();
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <GiftShopDialog key={request.id} request={request} />
    </Suspense>
  );
}
