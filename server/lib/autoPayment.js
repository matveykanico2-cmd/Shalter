const { isConnected: isDonationAlertsConnected, getDonationPageUrl: getDonationAlertsUrl } = require("./donationAlerts");
const { isConfigured: isDonatePayConfigured, getDonationPageUrl: getDonatePayUrl } = require("./donatePay");

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
