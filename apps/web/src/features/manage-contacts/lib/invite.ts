import { publicUrl } from "@/shared/lib/public-link";

/** Текст приглашения в Shalter — со ссылкой на вход. */
export const inviteText = () => `Привет! Пишу тебе из Shalter — попробуй, там удобно. ${publicUrl("/login")}`;
