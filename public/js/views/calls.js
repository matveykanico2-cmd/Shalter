import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { placeCall } from "../lib/callController.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";

function timeLabel(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function durationLabel(sec) {
  if (sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Вкладка «Звонки»: сверху — кнопка «Позвонить», под ней список людей, кому
// можно позвонить в одно нажатие, и только потом журнал.
//
// Раньше здесь был один журнал звонков — то есть позвонить со вкладки «Звонки»
// можно было только тому, кому уже звонил хотя бы раз. Первый звонок человеку
// приходилось начинать из переписки, а вкладка при пустом журнале была просто
// надписью «Звонков ещё не было».
export async function CallsView(root) {
  const me = getState().user;
  let calls = [];
  let contacts = [];
  let busy = null; // id человека, которому сейчас дозваниваемся

  // Оба запроса разом: журнал и контакты нужны одному экрану, и ждать их по
  // очереди значит показывать пустую страницу вдвое дольше.
  const [callsRes, contactsRes] = await Promise.all([
    api.listCalls().catch(() => ({ calls: [] })),
    api.listContacts().catch(() => ({ contacts: [] })),
  ]);
  calls = callsRes.calls ?? [];
  contacts = (contactsRes.contacts ?? []).map((c) => c.user).filter(Boolean);

  // У контакта нет chatId — звонок начинается с переписки. Находим её (или
  // заводим) и только потом звоним, тем же путём, каким это делается из чата.
  async function callUser(user, kind) {
    if (busy) return;
    busy = user.id;
    render();
    try {
      const { chat } = await api.startDm(user.id, user.name, user.avatarColor);
      await placeCall(chat.id, kind, me);
    } catch (err) {
      // Сюда попадает и отказ по настройкам собеседника («Кто может мне
      // звонить»), и он должен быть виден: молча ничего не происходящая кнопка
      // выглядит как поломка.
      alert(err.message || "Не удалось позвонить");
      busy = null;
      render();
    }
  }

  async function callChat(chatId, kind) {
    try {
      await placeCall(chatId, kind, me);
    } catch (err) {
      alert(err.message || "Не удалось позвонить");
    }
  }

  // Пара кнопок «позвонить» / «видеозвонок» — одна и та же в обоих списках,
  // чтобы строка журнала и строка контакта заканчивались одинаково.
  function callButtons(onAudio, onVideo, disabled) {
    return el("div", { class: "call-row-actions" }, [
      el("button", { class: "call-action-btn", title: "Позвонить", disabled, html: iconSvg("Phone", 17), onclick: onAudio }),
      el("button", { class: "call-action-btn video", title: "Видеозвонок", disabled, html: iconSvg("Video", 17), onclick: onVideo }),
    ]);
  }

  function historyRow(c) {
    const missed = c.status === "missed";
    return el("div", { class: "contact-row" }, [
      Avatar({ name: c.otherUser?.name ?? "?", color: c.otherUser?.avatarColor ?? "#8A8F98", image: c.otherUser?.avatarImage }),
      el("div", { class: "contact-row-body" }, [
        el("p", { class: `contact-row-name ${missed ? "missed-call" : ""}` }, c.otherUser?.name ?? "Неизвестно"),
        el("p", { class: "contact-row-status" }, [
          // Стрелка направления вместо повторного значка трубки: тип звонка уже
          // сказан кнопками справа, а вот «входящий или исходящий» из строки
          // иначе читался только словом.
          el("span", { class: `call-dir ${missed ? "missed" : ""}`, html: iconSvg(c.kind === "video" ? "Video" : "Phone", 12) }),
          ` ${c.direction === "incoming" ? "Входящий" : "Исходящий"}`,
          missed ? " · пропущен" : c.durationSec ? ` · ${durationLabel(c.durationSec)}` : "",
          ` · ${timeLabel(c.startedAt)}`,
        ]),
      ]),
      callButtons(() => callChat(c.chatId, "audio"), () => callChat(c.chatId, "video"), false),
    ]);
  }

  function contactRow(u) {
    const isBusy = busy === u.id;
    return el("div", { class: "contact-row" }, [
      Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, online: u.online }),
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

    body.appendChild(el("p", { class: "list-section-label" }, "Недавние"));
    if (calls.length === 0) {
      body.appendChild(el("p", { class: "empty-hint" }, "Звонков ещё не было"));
    } else {
      for (const c of calls) body.appendChild(historyRow(c));
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
        // Главное действие вкладки — отдельной кнопкой, а не спрятанное в
        // строку списка: «позвонить кому-то ещё» не должно требовать сначала
        // найти этого человека глазами.
        el("div", { class: "calls-start-panel" }, [
          el(
            "button",
            {
              class: "btn-accent calls-start-btn",
              onclick: () =>
                openContactPickerDialog((user) => callUser(user, "audio"), "Кому позвонить"),
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
