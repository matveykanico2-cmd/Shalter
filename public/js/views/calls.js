import { timeAgo } from "../lib/presence.js";
import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { placeCall } from "../lib/callController.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";

function timeLabel(iso) {
  return timeAgo(iso);
}

function durationLabel(sec) {
  if (sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function CallsView(root) {
  const me = getState().user;
  let calls = [];
  let contacts = [];
  let busy = null;
  let filter = "all";

  const [callsRes, contactsRes] = await Promise.all([
    api.listCalls().catch(() => ({ calls: [] })),
    api.listContacts().catch(() => ({ contacts: [] })),
  ]);
  calls = callsRes.calls ?? [];
  contacts = (contactsRes.contacts ?? []).map((c) => c.user).filter(Boolean);

  async function callUser(user, kind) {
    if (busy) return;
    busy = user.id;
    render();
    try {
      const { chat } = await api.startDm(user.id, user.name, user.avatarColor);
      await placeCall(chat.id, kind, me);
    } catch (err) {
      alert(err.message || "Не удалось позвонить");
      busy = null;
      render();
    }
  }

  async function callChat(chatId, kind) {
    try {
      await placeCall(chatId, kind, me, { ringAll: true });
    } catch (err) {
      alert(err.message || "Не удалось позвонить");
    }
  }

  function callButtons(onAudio, onVideo, disabled) {
    return el("div", { class: "call-row-actions" }, [
      el("button", { class: "call-action-btn", title: "Позвонить", disabled, html: iconSvg("Phone", 17), onclick: onAudio }),
      el("button", { class: "call-action-btn video", title: "Видеозвонок", disabled, html: iconSvg("Video", 17), onclick: onVideo }),
    ]);
  }

  const isMissed = (c) => (c.status === "missed" || c.status === "declined") && c.direction === "incoming";

  function historyRow(c) {
    const missed = isMissed(c);
    const unanswered = !missed && (c.status === "missed" || c.status === "declined");
    const name = c.group?.title ?? c.otherUser?.name ?? "Неизвестно";
    return el("div", { class: "contact-row" }, [
      el("button", { class: "call-row-open", title: "Открыть чат", onclick: () => navigate(`/chat/${c.chatId}`) }, [
        Avatar({
          name,
          color: c.group?.avatarColor ?? c.otherUser?.avatarColor ?? "#8A8F98",
          image: c.group?.avatarImage ?? c.otherUser?.avatarImage,
          size: 54,
        }),
      ]),
      el("div", { class: "contact-row-body" }, [
        el("p", { class: `contact-row-name ${missed ? "missed-call" : ""}` }, name),
        el("p", { class: "contact-row-status" }, [
          el("span", { class: `call-dir ${missed ? "missed" : ""}`, html: iconSvg(c.kind === "video" ? "Video" : "Phone", 12) }),
          ` ${c.direction === "incoming" ? "Входящий" : "Исходящий"}`,
          missed
            ? " · пропущен"
            : unanswered
              ? c.status === "declined" ? " · отклонён" : " · без ответа"
              : c.durationSec
                ? ` · ${durationLabel(c.durationSec)}`
                : "",
          ` · ${timeLabel(c.startedAt)}`,
        ]),
      ]),
      callButtons(() => callChat(c.chatId, "audio"), () => callChat(c.chatId, "video"), false),
    ]);
  }

  function contactRow(u) {
    const isBusy = busy === u.id;
    return el("div", { class: "contact-row" }, [
      Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, online: u.online, size: 54 }),
      el("div", { class: "contact-row-body" }, [
        el("p", { class: "contact-row-name" }, u.name),
        el("p", { class: `contact-row-status ${u.online ? "online" : ""}` }, isBusy ? "Соединяем…" : u.online ? "в сети" : u.username ? `@${u.username}` : "не в сети"),
      ]),
      callButtons(() => callUser(u, "audio"), () => callUser(u, "video"), isBusy),
    ]);
  }

  function render() {
    const body = el("div", { class: "chat-list-scroll" });

    if (contacts.length) {
      body.appendChild(el("p", { class: "list-section-label" }, `Контакты — ${contacts.length}`));
      for (const u of contacts) body.appendChild(contactRow(u));
    }

    const missedCount = calls.filter(isMissed).length;
    const shown = filter === "missed" ? calls.filter(isMissed) : calls;
    body.appendChild(
      el("div", { class: "calls-history-head" }, [
        el("p", { class: "list-section-label" }, "Недавние"),
        calls.length
          ? el("div", { class: "calls-filter" }, [
              el("button", { class: `search-filter-chip${filter === "all" ? " active" : ""}`, onclick: () => { filter = "all"; render(); } }, "Все"),
              el(
                "button",
                { class: `search-filter-chip${filter === "missed" ? " active" : ""}`, onclick: () => { filter = "missed"; render(); } },
                missedCount ? `Пропущенные ${missedCount}` : "Пропущенные"
              ),
            ])
          : null,
      ])
    );
    if (calls.length === 0) {
      body.appendChild(el("p", { class: "empty-hint" }, "Звонков ещё не было"));
    } else if (!shown.length) {
      body.appendChild(el("p", { class: "empty-hint" }, "Пропущенных звонков нет"));
    } else {
      for (const c of shown) body.appendChild(historyRow(c));
    }

    if (!contacts.length && !calls.length) {
      body.appendChild(
        el("p", { class: "empty-hint" }, "Добавьте человека в контакты — и сможете позвонить ему отсюда в одно нажатие.")
      );
    }

    mount(
      root,
      el("div", { class: "contacts-view" }, [
        el("header", { class: "contacts-header" }, [
          el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
          el("p", { class: "view-title" }, "Звонки"),
        ]),
        el("div", { class: "calls-start-panel" }, [
          el(
            "button",
            {
              class: "btn-accent calls-start-btn",
              onclick: () =>
                openContactPickerDialog((user) => callUser(user, "audio"), "Кому позвонить", { exclude: [getState().user?.id] }),
            },
            [el("span", { html: iconSvg("Phone", 17) }), " Позвонить"]
          ),
        ]),
        body,
      ])
    );
  }

  render();
}
