import type { SelfUser } from "../api/session-queries";

/** Модератор Shalter: удаляет за нарушение, решает жалобы (isServerModerator в public/js). */
export const isServerModerator = (me: SelfUser) => !!me.isDeveloper || (me.adminSections ?? []).includes("moderation");
