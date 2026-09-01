import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

// Календарь переписки: открывается нажатием на разделитель даты в чате
// («30 августа») и переносит к сообщениям выбранного дня.
//
// Дни, в которые ничего не писали, показываются приглушённо и не нажимаются —
// иначе выбор превращался бы в угадывание: в длинной переписке пустых дней
// больше, чем занятых.
const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

// Смещение часового пояса в минутах в привычную сторону: getTimezoneOffset
// возвращает его с обратным знаком (для Москвы −180, хотя пояс +3).
const tzOffset = () => -new Date().getTimezoneOffset();

const pad = (n) => String(n).padStart(2, "0");
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function openChatCalendarDialog({ chatId, around, onPick }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "calendar-body" });
  const dialog = el("div", { class: "modal-dialog calendar-dialog" }, [
    el("h2", { class: "modal-title" }, "Перейти к дате"),
    body,
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  // Месяц, который показан сейчас. Открывается на месяце того сообщения, по
  // чьей дате нажали, — а не на текущем: искать чаще всего идут рядом с тем
  // местом, где стоят.
  let shown = around ? new Date(around) : new Date();
  if (Number.isNaN(shown.getTime())) shown = new Date();
  let days = null; // null — ещё грузим
  let busy = false;
  let error = null;

  async function loadDays() {
    days = null;
    render();
    try {
      const res = await api.getChatMessageDays(chatId, monthKey(shown), tzOffset());
      days = new Set(res.days ?? []);
    } catch (err) {
      days = new Set();
      error = err.message || "Не удалось загрузить";
    }
    render();
  }

  async function pick(key) {
    if (busy) return;
    busy = true;
    error = null;
    render();
    try {
      const { message } = await api.getChatMessageAt(chatId, key, tzOffset());
      if (!message) {
        error = "В этот день и позже сообщений нет";
        busy = false;
        return render();
      }
      close();
      onPick?.(message.id);
    } catch (err) {
      error = err.message || "Не получилось перейти";
      busy = false;
      render();
    }
  }

  function shiftMonth(delta) {
    shown = new Date(shown.getFullYear(), shown.getMonth() + delta, 1);
    loadDays();
  }

  function render() {
    clear(body);
    const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
    const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
    // Неделя начинается с понедельника: getDay() отдаёт воскресенье нулём.
    const leading = (first.getDay() + 6) % 7;
    const today = dayKey(new Date());

    const cells = [];
    for (let i = 0; i < leading; i++) cells.push(el("span", { class: "calendar-cell empty" }));
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${shown.getFullYear()}-${pad(shown.getMonth() + 1)}-${pad(d)}`;
      const has = days ? days.has(key) : false;
      cells.push(
        el(
          "button",
          {
            class: `calendar-cell ${has ? "has" : "none"} ${key === today ? "today" : ""}`,
            type: "button",
            disabled: !has || busy,
            title: has ? "Перейти к сообщениям этого дня" : "В этот день не писали",
            onclick: () => pick(key),
          },
          String(d)
        )
      );
    }

    body.append(
      el("div", { class: "calendar-head" }, [
        el("button", { class: "calendar-nav", type: "button", html: iconSvg("ChevronLeft", 18), onclick: () => shiftMonth(-1) }),
        el("span", { class: "calendar-month" }, `${MONTHS[shown.getMonth()]} ${shown.getFullYear()}`),
        el("button", { class: "calendar-nav", type: "button", html: iconSvg("ChevronRight", 18), onclick: () => shiftMonth(1) }),
      ]),
      el("div", { class: "calendar-weekdays" }, WEEKDAYS.map((w) => el("span", {}, w))),
      days === null ? el("div", { class: "qr-login-spinner" }) : el("div", { class: "calendar-grid" }, cells),
      error ? el("p", { class: "login-error" }, error) : null,
      el("div", { class: "calendar-actions" }, [el("button", { class: "modal-cancel", onclick: close }, "Закрыть")])
    );
  }

  loadDays();
  return { close };
}
