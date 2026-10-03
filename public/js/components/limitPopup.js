import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { navigate } from "../router.js";

// Окно «Достигнут лимит» как в tweb (LimitLine + popup): плашка с числом над полосой
// «Бесплатно | Premium», описание и кнопка «Увеличить лимит» с градиентом Premium.
export function openLimitPopup({ icon = "Folder", count, free, premium, isPremium, title = "Достигнут лимит", text }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  function close() {
    overlay.remove();
  }
  const progress = isPremium ? 100 : Math.min(100, Math.round((free / premium) * 100));
  const hint = el("div", { class: `tw-limit-hint${isPremium ? " is-end" : ""}`, style: `--limit-progress:${progress}%` }, [
    el("span", { class: "tw-limit-hint-icon", html: iconSvg(icon, 20) }),
    el("span", {}, String(count ?? (isPremium ? premium : free))),
  ]);
  const line = el("div", { class: "tw-limit-line", style: `--limit-progress:${progress}%` }, [
    el("div", { class: "tw-limit-part tw-limit-free" }, [el("span", {}, "Бесплатно"), el("span", {}, String(free))]),
    el("div", { class: "tw-limit-part tw-limit-premium" }, [el("span", {}, "Premium"), el("span", {}, String(premium))]),
  ]);
  overlay.appendChild(
    el("div", { class: "modal-dialog tw-limit-popup" }, [
      el("div", { class: "tw-limit-container" }, [hint, line]),
      el("h2", { class: "tw-limit-title" }, title),
      el("p", { class: "tw-limit-text" }, text),
      el("div", { class: "tw-limit-actions" }, [
        isPremium
          ? el("button", { class: "tw-limit-ok", onclick: close }, "Понятно")
          : el("button", { class: "tw-limit-ok", onclick: close }, "Отмена"),
        isPremium
          ? null
          : el("button", { class: "tw-premium-confirm tw-limit-upgrade", onclick: () => { close(); navigate("/settings/premium"); } }, [
              "Увеличить лимит",
              el("span", { class: "tw-limit-upgrade-icon", html: iconSvg("ChevronRight", 18) }),
            ]),
      ]),
    ])
  );
  document.body.appendChild(overlay);
  requestAnimationFrame(() => hint.classList.add("active"));
}

// Сервер отвечает { error, limit } при упоре в лимит — показываем окно вместо текста ошибки.
export function showLimitFromError(err, { icon, text } = {}) {
  const limit = err?.data?.limit ?? err?.limit;
  if (!limit) return false;
  openLimitPopup({
    icon,
    count: limit.value,
    free: limit.free,
    premium: limit.premium,
    isPremium: limit.isPremium,
    text: text?.(limit) ?? err.message,
  });
  return true;
}
