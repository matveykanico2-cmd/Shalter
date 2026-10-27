import type { ComponentType } from "react";

import type { IconName, SettingsRowColor } from "@/shared/ui";

type SectionModule = { default: ComponentType };

export type SettingsSectionEntry = {
  id: string;
  /** Пункт меню и заголовок в шапке раздела. */
  label: string;
  icon: IconName;
  color: SettingsRowColor;
  /** Группа в главном меню; без группы раздел открывают из шапки («Изменить профиль»). */
  group?: "main" | "extra" | "admin";
  /** Только разработчику или тому, кому раздел выдан (adminSections). */
  adminOnly?: boolean;
  /** Раздел администрации, который открывает этот пункт (по умолчанию — id): «Промокоды» входят в «pricing». */
  adminSection?: string;
  /** Компонент раздела отдельным чанком: без пропсов, сам берёт useSession/useSettings. */
  load: () => Promise<SectionModule>;
};

/**
 * Разделы настроек в порядке меню — SECTIONS в public/js/views/settings/index.js.
 * Раздел из features подключается одной строкой:
 *   load: () => import("@/features/x").then((m) => ({ default: m.XSection })),
 * Свои разделы views/settings — из ../ui/sections.
 */
export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  { id: "profile", label: "Изменить профиль", icon: "Edit", color: "blue", load: () => import("../ui/sections/profile-section").then((m) => ({ default: m.ProfileSection })) },
  { id: "notifications", label: "Уведомления", icon: "Bell", color: "red", group: "main", load: () => import("../ui/sections/notifications-section").then((m) => ({ default: m.NotificationsSection })) },
  { id: "holidays", label: "Праздники", icon: "Gift", color: "orange", group: "main", load: () => import("../ui/sections/holidays-section").then((m) => ({ default: m.HolidaysSection })) },
  { id: "data", label: "Данные и память", icon: "Download", color: "green", group: "main", load: () => import("../ui/sections/data-section").then((m) => ({ default: m.DataSection })) },
  // privacy, appearance, folders — агент settings-security.
  { id: "privacy", label: "Конфиденциальность", icon: "Lock", color: "grey", group: "main", load: () => import("@/features/privacy-settings").then((m) => ({ default: m.PrivacySection })) },
  { id: "appearance", label: "Внешний вид", icon: "Palette", color: "orange", group: "main", load: () => import("@/features/appearance-settings").then((m) => ({ default: m.AppearanceSection })) },
  { id: "folders", label: "Папки с чатами", icon: "Folder", color: "blue", group: "main", load: () => import("@/features/chat-folders").then((m) => ({ default: m.FoldersSection })) },
  { id: "devices", label: "Устройства", icon: "Monitor", color: "blue", group: "main", load: () => import("../ui/sections/devices-section").then((m) => ({ default: m.DevicesSection })) },
  { id: "accounts", label: "Аккаунты", icon: "Accounts", color: "purple", group: "main", load: () => import("../ui/sections/accounts-section").then((m) => ({ default: m.AccountsSection })) },
  { id: "shortcuts", label: "Горячие клавиши", icon: "Keyboard", color: "orange", group: "main", load: () => import("../ui/sections/shortcuts-section").then((m) => ({ default: m.ShortcutsSection })) },
  // Экономика и платформа — агенты economy и другие.
  { id: "premium", label: "Shalter Premium", icon: "Star", color: "premium", group: "extra", load: () => import("@/features/purchase").then((m) => ({ default: m.PremiumSection })) },
  { id: "business", label: "Shalter для бизнеса", icon: "Bag", color: "green", group: "extra", load: () => import("@/features/business").then((m) => ({ default: m.BusinessSection })) },
  { id: "partners", label: "Партнёрка", icon: "Users", color: "purple", group: "extra", load: () => import("@/features/partners").then((m) => ({ default: m.PartnersSection })) },
  { id: "oauth", label: "Войти через Shalter", icon: "Lock", color: "blue", group: "extra", load: () => import("@/features/oauth-apps").then((m) => ({ default: m.OAuthAppsSection })) },
  { id: "stars", label: "Звёзды", icon: "Zap", color: "orange", group: "extra", load: () => import("@/features/purchase").then((m) => ({ default: m.StarsSection })) },
  { id: "usernames", label: "Аукцион юзернеймов", icon: "Globe", color: "blue", group: "extra", load: () => import("@/features/usernames-market").then((m) => ({ default: m.UsernamesSection })) },
  { id: "ads", label: "Реклама", icon: "BarChart", color: "pink", group: "extra", load: () => import("@/features/ad-cabinet").then((m) => ({ default: m.AdsSection })) },
  { id: "bots", label: "Боты", icon: "Code", color: "green", group: "extra", load: () => import("@/features/my-bots").then((m) => ({ default: m.BotsSection })) },
  { id: "games", label: "Игры", icon: "Smile", color: "pink", group: "extra", load: () => import("../ui/sections/games-section").then((m) => ({ default: m.GamesSection })) },
  { id: "about", label: "О приложении", icon: "Info", color: "grey", group: "extra", load: () => import("../ui/sections/about-section").then((m) => ({ default: m.AboutSection })) },
  // Администрирование — агент admin.
  { id: "moderation", label: "Модерация", icon: "Shield", color: "red", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.ModerationSection })) },
  { id: "server", label: "Состояние сервера", icon: "BarChart", color: "purple", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.ServerSection })) },
  { id: "giftshop", label: "Каталог подарков", icon: "Gift", color: "orange", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.GiftShopSection })) },
  { id: "emojicatalog", label: "Эмодзи", icon: "Smile", color: "orange", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.EmojiCatalogSection })) },
  { id: "donations", label: "Донаты", icon: "Zap", color: "pink", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.DonationsSection })) },
  { id: "pricing", label: "Цены и тарифы", icon: "Star", color: "green", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.PricingSection })) },
  { id: "promotions", label: "Промокоды", icon: "Gift", color: "orange", group: "admin", adminOnly: true, adminSection: "pricing", load: () => import("@/features/admin").then((m) => ({ default: m.PromotionsSection })) },
  { id: "legal", label: "Запросы органов", icon: "Shield", color: "grey", group: "admin", adminOnly: true, load: () => import("@/features/admin").then((m) => ({ default: m.LegalSection })) },
];

/** Виден ли раздел этому пользователю (adminOnly — разработчику или по adminSections). */
export const canSeeSection = (s: SettingsSectionEntry, me: { isDeveloper?: boolean; adminSections?: readonly string[] }) =>
  !s.adminOnly || !!me.isDeveloper || !!me.adminSections?.includes(s.adminSection ?? s.id);
