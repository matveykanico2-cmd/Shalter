import type { IconName } from "@/shared/ui";

import type { PremiumInfo } from "../api/purchase";

export function formatPremiumUntil(info: Pick<PremiumInfo, "premiumForever" | "premiumUntil">) {
  if (info.premiumForever) return "Активен навсегда";
  if (info.premiumUntil) {
    return `Активен до ${new Date(info.premiumUntil).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  }
  return "Уберите ограничения и получите золотой значок";
}

export const PREMIUM_COMPARE = [
  ["Платная личка незнакомцам", "⭐ звёздами", "Бесплатно"],
  ["Писать в «только контакты»", "—", "Да"],
  ["Звонки незнакомцам со включённой платой", "⭐ звёздами", "Бесплатно"],
  ["Пригласить в звонок по ссылке", "только участников", "Кого угодно"],
  ["Статусы профиля", "1", "до 5"],
  ["Значок и кольцо Premium", "—", "Да"],
  ["Эксклюзивные реакции 💎 👑 🚀 🥂 💯 🌟", "—", "Да"],
  ["Реакций на одно сообщение", "1", "до 3"],
  ["Цвет имени в группах", "—", "7 цветов"],
  ["Реклама в списке чатов", "есть", "нет"],
] as const;

// Цвета иконок возможностей — тот же градиент, что PREMIUM_FEATURES_COLORS в tweb.
const COLORS = ["#ef6922", "#e74e33", "#db374b", "#bc4395", "#9b4fed", "#676bff", "#4492ff", "#41a6a5", "#3dbd4a"];

export type PremiumPerk = { icon: IconName; title: string; desc: string; color: string };

export const PREMIUM_PERKS: readonly PremiumPerk[] = (
  [
    { icon: "Palette", title: "Цвет имени", desc: "Выберите цвет, которым ваше имя показывается в группах" },
    { icon: "BarChart", title: "Без рекламы", desc: "Спонсорские объявления в списке чатов и каналах больше не показываются" },
    {
      icon: "MessageSquare",
      title: "Пишите и звоните бесплатно",
      desc: "Платная личка и звонки незнакомцам не берут с вас звёзды, даже если у собеседника это включено",
    },
    { icon: "Lock", title: "Доступ в закрытую личку", desc: "Пишите даже тем, кто разрешил сообщения только от контактов" },
    { icon: "Video", title: "Ссылка на звонок для всех", desc: "Приглашайте в звонок кого угодно, не только участников чата" },
    { icon: "Smile", title: "До 5 статусов профиля", desc: "Готовых или своих — вместо одного на обычном аккаунте" },
    { icon: "Star", title: "Значок Premium", desc: "Звезда у имени и особое кольцо вокруг аватарки" },
    { icon: "Zap", title: "Эксклюзивные реакции", desc: "💎 👑 🚀 🥂 💯 🌟 — доступны в любом чате" },
    {
      icon: "CheckCheck",
      title: "До 3 реакций на сообщение",
      desc: "Обычный аккаунт может оставить только одну реакцию под сообщением — Premium ставит до трёх разом",
    },
  ] satisfies Omit<PremiumPerk, "color">[]
).map((p, i) => ({ ...p, color: COLORS[i % COLORS.length]! }));
