// Which automatic-payment rail (if any) is available right now — checked by
// every /request route (premium.js, ads.js, gifts.js) instead of each one
// repeating "DonationAlerts, else DonatePay, else manual transfer" itself.
// DonationAlerts first because it's the one with an actual OAuth
// connection step the admin explicitly completed; DonatePay is checked
// second since it only needs an env var to "turn on", so it's the one more
// likely to be half-configured by accident.
const { isConnected: isDonationAlertsConnected, getDonationPageUrl: getDonationAlertsUrl } = require("./donationAlerts");
const { isConfigured: isDonatePayConfigured, getDonationPageUrl: getDonatePayUrl } = require("./donatePay");

// Returns { provider: "donationalerts" | "donatepay", donationUrl } or null
// if neither is set up (the manual-transfer path every /request route falls
// back to).
function getActiveDonationLink() {
  if (isDonationAlertsConnected()) {
    const donationUrl = getDonationAlertsUrl();
    if (donationUrl) return { provider: "donationalerts", donationUrl };
  }
  if (isDonatePayConfigured()) {
    const donationUrl = getDonatePayUrl();
    if (donationUrl) return { provider: "donatepay", donationUrl };
  }
  return null;
}

module.exports = { getActiveDonationLink };
