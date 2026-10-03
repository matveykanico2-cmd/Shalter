import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { navigate } from "../router.js";
import { levelBounds } from "../lib/groupLevels.js";
import { Avatar } from "./avatar.js";

// Окно буста как в tweb (popups/boost.tsx): аватар чата, полоса «Уровень N → N+1»
// с плашкой числа бустов, описание и кнопка «Бустнуть».
export function openBoostPopup({ chat, isPremium, myLastBoostAt, onBoost }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const what = chat.type === "channel" ? "канал" : "группу";
  const whatGen = chat.type === "channel" ? "канала" : "группы";
  function close() {
    overlay.remove();
  }

  function render(c) {
    const points = c.points ?? 0;
    const { level, from, to } = levelBounds(points);
    const progress = to == null ? 100 : Math.max(4, Math.min(100, Math.round(((points - from) / (to - from)) * 100)));
    const boostedToday = myLastBoostAt && Date.now() - new Date(myLastBoostAt).getTime() < 24 * 3600_000;
    const hint = el("div", { class: `tw-limit-hint${progress >= 92 ? " is-end" : progress <= 8 ? " is-start" : ""}`, style: `--limit-progress:${progress}%` }, [
      el("span", { class: "tw-limit-hint-icon", html: iconSvg("Zap", 20) }),
      el("span", {}, String(points)),
    ]);
    const line = el("div", { class: "tw-limit-line tw-boost-line", style: `--limit-progress:${progress}%` }, [
      el("div", { class: "tw-boost-fill" }),
      el("div", { class: "tw-limit-part" }, [el("span", {}, `Уровень ${level}`), to == null ? null : el("span", {}, `Уровень ${level + 1}`)]),
    ]);
    const left = to == null ? 0 : to - points;
    const dialog = el("div", { class: "modal-dialog tw-limit-popup tw-boost-popup" }, [
      el("div", { class: "tw-boost-entity" }, [
        Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 30 }),
        el("span", {}, c.title),
      ]),
      el("div", { class: "tw-limit-container" }, [hint, line]),
      el("h2", { class: "tw-limit-title" }, boostedToday ? "Вы уже бустили сегодня" : to == null ? "Максимальный уровень" : "Нужно больше бустов"),
      el(
        "p",
        { class: "tw-limit-text" },
        to == null
          ? `У ${whatGen} максимальный уровень — спасибо всем, кто бустил!`
          : `Ещё ${left} ${plural(left, "буст", "буста", "бустов")} — и ${what} получит уровень ${level + 1}. Бустить можно раз в сутки.`
      ),
      el("div", { class: "tw-limit-actions" }, [
        el("button", { class: "tw-limit-ok", onclick: close }, "Закрыть"),
        isPremium
          ? el(
              "button",
              {
                class: "tw-premium-confirm tw-limit-upgrade",
                disabled: !!boostedToday,
                onclick: async (e) => {
                  e.currentTarget.disabled = true;
                  const updated = await onBoost().catch((err) => {
                    alert(err.message || "Не удалось бустнуть");
                    return null;
                  });
                  if (updated) {
                    myLastBoostAt = new Date().toISOString();
                    render(updated);
                  } else e.currentTarget.disabled = false;
                },
              },
              [el("span", { class: "tw-limit-upgrade-icon", html: iconSvg("Zap", 20) }), boostedToday ? "Буст через сутки" : `Бустнуть ${what}`]
            )
          : el("button", { class: "tw-premium-confirm tw-limit-upgrade", onclick: () => { close(); navigate("/settings/premium"); } }, [
              el("span", { class: "tw-limit-upgrade-icon", html: iconSvg("Star", 20) }),
              "Бусты — с Shalter Premium",
            ]),
      ]),
    ]);
    overlay.replaceChildren(dialog);
    requestAnimationFrame(() => hint.classList.add("active"));
  }

  render(chat);
  document.body.appendChild(overlay);
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
