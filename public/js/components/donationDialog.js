import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Shown instead of navigating to a chat with the admin, once DonationAlerts
// is connected (server/lib/donationAlerts.js) — the buyer pays for real and
// a background sweep fulfills it automatically (server: premium.js/ads.js/
// gifts.js's /request), instead of the old "message the admin, wait for
// them to notice and confirm by hand" flow.
export function openDonationDialog({ donationUrl, code, amountRub }) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const copiedNote = el("p", { class: "settings-toggle-hint" });

  const dialog = el("div", { class: "modal-dialog donation-dialog" }, [
    el("h2", { class: "modal-title" }, "Оплата через DonationAlerts"),
    el("p", { class: "settings-toggle-hint" }, `Переведите ${amountRub}₽ по ссылке ниже и обязательно укажите в сообщении к донату этот код — иначе оплата не свяжется с вашей покупкой:`),
    el("div", { class: "donation-code-row" }, [
      el("span", { class: "mono donation-code-value" }, code),
      el("button", {
        class: "icon-btn",
        title: "Скопировать код",
        html: iconSvg("Copy", 16),
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(code);
            copiedNote.textContent = "Код скопирован ✓";
          } catch {
            copiedNote.textContent = "Не удалось скопировать — выделите вручную";
          }
        },
      }),
    ]),
    copiedNote,
    el("a", { class: "btn-accent donation-link-btn", href: donationUrl, target: "_blank", rel: "noreferrer" }, "Перейти к оплате"),
    el("p", { class: "settings-toggle-hint" }, "Как только донат придёт — покупка активируется автоматически, обычно в течение минуты."),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Готово"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
}
