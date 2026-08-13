import { openDonationDialog } from "../components/donationDialog.js";
import { navigate } from "../router.js";

// One place that turns a /request response into the right next step, so
// Premium, Реклама and Gifts can't drift apart in how they take payment.
//   { donationUrl, code, amountRub } → DonationAlerts, cleared automatically
//   { chatId }                       → a plain transfer: the buyer lands in a
//                                      DM with the admin, having just sent
//                                      "перевожу на <номер>, жду подтверждения",
//                                      and the admin hands the purchase over
//                                      from the buyer's profile (see
//                                      components/adminUserPanel.js).
export function handlePurchaseResponse(res) {
  if (res.donationUrl) {
    openDonationDialog(res);
    return;
  }
  if (res.chatId) navigate(`/chat/${res.chatId}`);
}
