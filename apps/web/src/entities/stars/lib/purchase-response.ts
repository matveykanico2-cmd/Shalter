import { type DonationOrder, showDonationOrder } from "../model/purchase-store";

/**
 * Ответ на заявку о покупке (handlePurchaseResponse в public/js/lib/purchase.js): с донат-сервисом —
 * окно с кодом заказа, без него — заявка ушла админу, открываем личку с ней.
 */
export function handlePurchaseResponse(res: Partial<DonationOrder> & { chatId?: string }, openChat: (chatId: string) => void) {
  if (res.donationUrl) {
    showDonationOrder(res as DonationOrder);
    return;
  }
  if (res.chatId) openChat(res.chatId);
}
