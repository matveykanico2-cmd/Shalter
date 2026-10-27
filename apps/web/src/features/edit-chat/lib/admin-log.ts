// Строки журнала «Недавние действия» — как describe в public/js/components/adminLogDialog.js.
import type { AdminLogEntry } from "../api/edit-chat";

const duration = (s: number) => (s >= 3600 ? `${s / 3600} ч` : s >= 60 ? `${s / 60} мин` : `${s} с`);

type Details = { value?: unknown; until?: unknown; seconds?: unknown; title?: unknown };

/** Что сделал админ — без его имени: «изменил(а) название на «…»». */
export function describeAdminAction(entry: AdminLogEntry, name: (userId: string) => string) {
  const target = entry.targetId ? name(entry.targetId) : "";
  const d: Details = entry.details && typeof entry.details === "object" ? (entry.details as Details) : {};
  const v = typeof d.value === "string" ? d.value : d.value ? String(d.value) : "";
  const topic = typeof d.title === "string" ? d.title : "";
  switch (entry.action) {
    case "member_add": return `добавил(а) ${target}`;
    case "member_kick": return `удалил(а) ${target}`;
    case "member_ban": return `заблокировал(а) ${target}`;
    case "member_unban": return `разблокировал(а) ${target}`;
    case "member_promote": return `назначил(а) администратором ${target}`;
    case "member_demote": return `снял(а) администратора ${target}`;
    case "member_mod": return `назначил(а) модератором ${target}`;
    case "member_unmod": return `снял(а) модератора ${target}`;
    case "member_owner": return `сделал(а) совладельцем ${target}`;
    case "member_unowner": return `снял(а) права владельца с ${target}`;
    case "member_transfer": return `передал(а) права владельца ${target}`;
    case "member_restrict":
      return `запретил(а) писать ${target}${typeof d.until === "string" && d.until !== "forever" ? ` до ${new Date(d.until).toLocaleString("ru-RU")}` : ""}`;
    case "member_unrestrict": return `разрешил(а) писать ${target}`;
    case "member_tag": return v ? `поставил(а) тег «${v}» участнику ${target}` : `убрал(а) тег у ${target}`;
    case "join_approve": return `одобрил(а) заявку ${target}`;
    case "chat_title": return `изменил(а) название на «${v}»`;
    case "chat_description": return v ? "изменил(а) описание" : "удалил(а) описание";
    case "chat_avatarImage": return "изменил(а) аватар";
    case "chat_autoDeleteSeconds": return v ? "включил(а) автоудаление сообщений" : "выключил(а) автоудаление";
    case "slow_mode": return typeof d.seconds === "number" && d.seconds ? `включил(а) медленный режим: ${duration(d.seconds)}` : "выключил(а) медленный режим";
    case "permissions": return "изменил(а) права участников";
    case "settings": return "изменил(а) настройки";
    case "welcome": return v ? "изменил(а) приветствие" : "выключил(а) приветствие";
    case "topics_on": return "включил(а) темы";
    case "topics_off": return "выключил(а) темы";
    case "topic_create": return `создал(а) тему «${topic}»`;
    case "topic_edit": return `изменил(а) тему «${topic}»`;
    case "topic_close": return `закрыл(а) тему «${topic}»`;
    case "topic_open": return `открыл(а) тему «${topic}»`;
    case "topic_delete": return `удалил(а) тему «${topic}»`;
    default: return entry.action;
  }
}
