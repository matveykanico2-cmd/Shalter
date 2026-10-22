import { Injectable } from "@nestjs/common";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { donationAlerts, isDonatePayConfigured } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";

// Подключение DonationAlerts админом с разделом «donations» — как server/routes/donationAlerts.js.
// Сам OAuth-обмен и опрос донатов — в server/lib/donationAlerts.js.
@Injectable()
export class DonationAlertsService {
  public constructor(private readonly users: UsersRepository) {}

  public canManage(uid: string): boolean {
    return hasAdminSection(this.users.findById(uid), "donations");
  }

  public status() {
    const da = donationAlerts();
    const auth = da.loadAuth();
    return {
      configured: da.isConfigured(),
      connected: da.isConnected(),
      username: auth?.username ?? null,
      donatePayConfigured: isDonatePayConfigured(),
    };
  }

  /** Адрес страницы авторизации; null — на сервере нет client id/secret. */
  public authorizeUrl(): string | null {
    const da = donationAlerts();
    return da.isConfigured() ? da.getAuthorizeUrl() : null;
  }

  /** Куда вернуть админа после OAuth: в настройки донатов, с итогом. */
  public async callback(code: unknown, error: unknown): Promise<string> {
    if (error || !code) return "/settings/donations?error=1";
    try {
      await donationAlerts().exchangeCodeForTokens(String(code));
      return "/settings/donations?connected=1";
    } catch (err) {
      console.error("DonationAlerts callback failed:", err);
      return "/settings/donations?error=1";
    }
  }
}
