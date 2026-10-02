import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";

// «Недавние действия» группы или канала — журнал администраторов.
const DURATION = (s) => (s >= 3600 ? `${s / 3600} ч` : s >= 60 ? `${s / 60} мин` : `${s} с`);

function describe(entry, name) {
  const target = entry.targetId ? name(entry.targetId) : "";
  const v = entry.details?.value;
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
    case "member_restrict": return `запретил(а) писать ${target}${entry.details?.until && entry.details.until !== "forever" ? ` до ${new Date(entry.details.until).toLocaleString("ru-RU")}` : ""}`;
    case "member_unrestrict": return `разрешил(а) писать ${target}`;
    case "member_tag": return v ? `поставил(а) тег «${v}» участнику ${target}` : `убрал(а) тег у ${target}`;
    case "join_approve": return `одобрил(а) заявку ${target}`;
    case "chat_title": return `изменил(а) название на «${v}»`;
    case "chat_description": return v ? "изменил(а) описание" : "удалил(а) описание";
    case "chat_avatarImage": return "изменил(а) аватар";
    case "chat_autoDeleteSeconds": return v ? "включил(а) автоудаление сообщений" : "выключил(а) автоудаление";
    case "slow_mode": return entry.details?.seconds ? `включил(а) медленный режим: ${DURATION(entry.details.seconds)}` : "выключил(а) медленный режим";
    case "permissions": return "изменил(а) права участников";
    case "settings": return "изменил(а) настройки";
    case "welcome": return v ? "изменил(а) приветствие" : "выключил(а) приветствие";
    case "topics_on": return "включил(а) темы";
    case "topics_off": return "выключил(а) темы";
    case "topic_create": return `создал(а) тему «${entry.details?.title ?? ""}»`;
    case "topic_edit": return `изменил(а) тему «${entry.details?.title ?? ""}»`;
    case "topic_close": return `закрыл(а) тему «${entry.details?.title ?? ""}»`;
    case "topic_open": return `открыл(а) тему «${entry.details?.title ?? ""}»`;
    case "topic_delete": return `удалил(а) тему «${entry.details?.title ?? ""}»`;
    default: return entry.action;
  }
}

export function openAdminLogDialog(chat) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "admin-log-body" }, el("p", { class: "empty-hint" }, "Загрузка…"));
  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, "Недавние действия"),
    body,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  function close() {
    overlay.remove();
  }

  const users = new Map();
  let entries = [];

  async function load(beforeId) {
    try {
      const res = await api.getAdminLog(chat.id, beforeId);
      for (const u of res.users ?? []) users.set(u.id, u);
      entries = beforeId ? [...entries, ...res.entries] : res.entries;
      render(res.entries.length === 100);
    } catch (err) {
      clear(body);
      body.appendChild(el("p", { class: "login-error" }, err.message || "Не удалось загрузить журнал"));
    }
  }

  function render(hasMore) {
    clear(body);
    if (!entries.length) {
      body.appendChild(el("p", { class: "empty-hint" }, "За последние 30 дней администраторы ничего не меняли"));
      return;
    }
    const name = (id) => users.get(id)?.name ?? "кто-то";
    const rows = [
      ...entries.map((e) => {
        const actor = users.get(e.actorId);
        return el("div", { class: "admin-log-row" }, [
          Avatar({ name: actor?.name ?? "?", color: actor?.avatarColor, image: actor?.avatarImage, size: 32 }),
          el("div", { class: "admin-log-text" }, [
            el("p", {}, [el("b", {}, actor?.name ?? "Кто-то"), " ", describe(e, name)]),
            el("p", { class: "admin-log-time" }, new Date(e.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })),
          ]),
        ]);
      }),
      hasMore ? el("button", { class: "profile-action-btn", onclick: () => load(entries[entries.length - 1].id) }, "Показать ещё") : null,
    ];
    body.append(...rows.filter(Boolean));
  }

  load();
}
