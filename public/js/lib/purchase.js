import { openDonationDialog } from "../components/donationDialog.js";
import { navigate } from "../router.js";

export function handlePurchaseResponse(res) {
  if (res.donationUrl) {
    openDonationDialog(res);
    return;
  }
  if (res.chatId) navigate(`/chat/${res.chatId}`);
}
