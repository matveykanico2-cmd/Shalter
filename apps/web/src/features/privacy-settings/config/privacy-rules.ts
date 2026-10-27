import type { Settings } from "@/entities/settings";

export type PrivacyLevel = "everyone" | "contacts" | "nobody";
export type RuleKey = Exclude<keyof Settings["privacy"], "exceptions">;
export type PrivacyRule = { key: RuleKey; label: string; who: string };

export const LEVELS: readonly { value: PrivacyLevel; label: string }[] = [
  { value: "everyone", label: "Все" },
  { value: "contacts", label: "Мои контакты" },
  { value: "nobody", label: "Никто" },
];

export const levelLabel = (v: string | undefined) => LEVELS.find((o) => o.value === v)?.label ?? "Все";

/** Порядок — как в tweb (sidebarLeft/tabs/privacyAndSecurity), в конце — пункты Shalter. */
export const PRIVACY_RULES: readonly PrivacyRule[] = [
  { key: "phone", label: "Номер телефона", who: "Кто видит мой номер телефона?" },
  { key: "lastSeen", label: "Время захода", who: "Кто видит время моего последнего захода?" },
  { key: "photo", label: "Фотографии профиля", who: "Кто видит фото моего профиля?" },
  { key: "bio", label: "О себе", who: "Кто видит раздел «О себе»?" },
  { key: "calls", label: "Звонки", who: "Кто может мне звонить?" },
  { key: "forwards", label: "Пересылка сообщений", who: "Кто может ссылаться на мой аккаунт при пересылке?" },
  { key: "invites", label: "Приглашения", who: "Кто может приглашать меня в группы и каналы?" },
  { key: "messages", label: "Сообщения", who: "Кто может мне писать?" },
  { key: "birthday", label: "Дата рождения", who: "Кто видит мою дату рождения?" },
  { key: "discoverByPhone", label: "Поиск по номеру", who: "Кто может найти меня по номеру?" },
  { key: "botMessages", label: "Боты", who: "Какие боты могут писать мне первыми?" },
  { key: "storiesArchive", label: "Архив историй", who: "Кто видит архив моих историй?" },
];
