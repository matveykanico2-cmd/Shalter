// Экран блокировки аккаунта, как в Telegram: заблокированный администрацией входит в
// аккаунт, но вместо чатов и настроек видит только этот экран поверх всего — причину,
// до какого времени блокировка и сколько осталось, и кнопку «Назад», чтобы выйти и
// войти в другой аккаунт. Показывается по ответу 403 { error: "banned" } (api.js,
// wsClient.js); повторные вызовы только обновляют уже открытый экран.
//
// Модуль не импортирует api.js (тот грузит его сам, лениво) — запросы здесь напрямую.
import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

let screen = null;
let timer = null;

const pad = (n) => String(n).padStart(2, "0");

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// «2 дня 3 часа», «5 часов 12 минут», «04:59» — чем ближе конец, тем точнее.
function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days) return `${days} ${plural(days, "день", "дня", "дней")}${hours ? ` ${hours} ${plural(hours, "час", "часа", "часов")}` : ""}`;
  if (hours) return `${hours} ${plural(hours, "час", "часа", "часов")}${mins ? ` ${mins} ${plural(mins, "минута", "минуты", "минут")}` : ""}`;
  return `${pad(mins)}:${pad(secs)}`;
}

function formatUntil(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  return `${date} в ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Выход из заблокированного аккаунта на этом устройстве. Если подключены другие
// аккаунты — переключаемся на первый из них, иначе — на экран входа.
async function leave(button) {
  button.disabled = true;
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const { remaining = [] } = await res.json().catch(() => ({}));
    if (remaining.length) {
      await fetch("/api/auth/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: remaining[0] }),
      });
      window.location.href = "/";
      return;
    }
  } catch {
    // Нет сети — cookie всё равно не снять; экран входа сам предложит войти заново.
  }
  window.location.href = "/login";
}

export function showBanScreen({ banReason = null, bannedUntil = null } = {}) {
  const until = bannedUntil ? Date.parse(bannedUntil) : null;
  if (until && until <= Date.now()) {
    // Срок как раз истёк — сервер уже пускает, достаточно перезагрузить.
    window.location.reload();
    return;
  }

  const left = el("p", { class: "ban-screen-left" });
  const tick = () => {
    const ms = until - Date.now();
    if (ms <= 0) {
      clearInterval(timer);
      window.location.reload();
      return;
    }
    left.textContent = `Осталось ${formatLeft(ms)}`;
  };

  const back = el("button", { class: "btn-accent ban-screen-back", type: "button" }, [el("span", { html: iconSvg("ChevronLeft", 18) }), "Назад"]);
  back.addEventListener("click", () => leave(back));

  const card = el("div", { class: "ban-screen-card", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "ban-screen-title" }, [
    el("div", { class: "ban-screen-icon", html: iconSvg("ShieldOff", 44) }),
    el("h1", { class: "ban-screen-title", id: "ban-screen-title" }, "Аккаунт заблокирован"),
    el("p", { class: "ban-screen-text" }, "Администрация Shalter ограничила доступ к вашему аккаунту. Пока блокировка действует, чаты и настройки недоступны."),
    banReason ? el("div", { class: "ban-screen-reason" }, [el("span", { class: "ban-screen-label" }, "Причина"), el("p", {}, banReason)]) : null,
    el("div", { class: "ban-screen-term" }, [
      el("span", { html: iconSvg("Clock", 18) }),
      el("div", {}, [
        el("p", { class: "ban-screen-until" }, until ? `Заблокирован до ${formatUntil(bannedUntil)}` : "Блокировка бессрочная"),
        until ? left : null,
      ]),
    ]),
    back,
    el("p", { class: "ban-screen-hint" }, "«Назад» — выйти из этого аккаунта и войти в другой"),
  ]);

  clearInterval(timer);
  const next = el("div", { class: "ban-screen home-wallpaper wallpaper-default" }, [card]);
  if (screen) screen.replaceWith(next);
  else document.body.appendChild(next);
  screen = next;
  // Приложение под экраном недоступно ни мыши, ни клавиатуре, ни скринридеру.
  for (const node of document.body.children) {
    if (node === next) continue;
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
  }
  document.body.classList.add("ban-screen-open");
  if (until) {
    tick();
    timer = setInterval(tick, 1000);
  }
  back.focus();
}

export function isBanScreenShown() {
  return !!screen;
}
