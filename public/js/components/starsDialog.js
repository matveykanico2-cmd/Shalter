import { el, clear, appendAll } from "../lib/dom.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { handlePurchaseResponse } from "../lib/purchase.js";
import { iconSvg } from "../icons.js";

const STAR_PATH =
  "M12.413 20.3615L7.4621 23.3945C6.9473 23.7098 6.27431 23.5482 5.95894 23.0333C5.80491 22.7819 5.75899 22.4789 5.8316 22.1931L6.598 19.1766C6.87465 18.0876 7.61981 17.1774 8.63265 16.6911L14.0338 14.0979C14.2857 13.977 14.3918 13.6749 14.2709 13.4231C14.173 13.2191 13.9516 13.105 13.7287 13.1436L7.71644 14.1845C6.49429 14.3961 5.24099 14.0586 4.29035 13.2619L2.39103 11.6702C1.92831 11.2825 1.86756 10.593 2.25533 10.1303C2.44393 9.90522 2.71514 9.7655 3.00787 9.74259L8.81084 9.28846C9.2208 9.25637 9.57808 8.99693 9.73546 8.61702L11.9741 3.21299C12.2052 2.65524 12.8447 2.39039 13.4024 2.62145C13.6702 2.7324 13.883 2.94518 13.9939 3.21299L16.2326 8.61702C16.39 8.99693 16.7473 9.25637 17.1572 9.28846L22.9921 9.74509C23.594 9.79219 24.0437 10.3183 23.9966 10.9202C23.974 11.2097 23.837 11.4783 23.616 11.6668L19.166 15.4605C18.8527 15.7275 18.7161 16.148 18.8124 16.5482L20.1805 22.2314C20.3218 22.8184 19.9605 23.4087 19.3735 23.55C19.0915 23.6179 18.794 23.5709 18.5467 23.4194L13.5551 20.3615C13.2046 20.1468 12.7634 20.1468 12.413 20.3615Z";

let starSeq = 0;

// Золотая звезда tweb (StarsStrokeStar): градиентная заливка, обводка и светлый блик.
export function starIconSvg(stroke = false) {
  const id = `tw-star-${++starSeq}`;
  return `<svg class="tw-star${stroke ? " tw-star-stroke" : ""}" viewBox="0 0 26 25" fill="none" aria-hidden="true">
${stroke ? `<path d="${STAR_PATH}" stroke="var(--tw-star-bg)" stroke-width="3.6"/>` : ""}
<path fill-rule="evenodd" d="${STAR_PATH}" fill="url(#${id}a)" stroke="url(#${id}b)" stroke-width="1.22"/>
<defs>
<linearGradient id="${id}a" x1="0.09" y1="28.15" x2="41.4" y2="-18.4" gradientUnits="userSpaceOnUse"><stop stop-color="#FDEB32"/><stop offset="0.44" stop-color="#FEBD04"/><stop offset="1" stop-color="#D75902"/></linearGradient>
<linearGradient id="${id}b" x1="27.06" y1="3.61" x2="9.33" y2="15.83" gradientUnits="userSpaceOnUse"><stop stop-color="#DB5A00"/><stop offset="1" stop-color="#FF9145"/></linearGradient>
</defs></svg>`;
}

// Стопка звёзд у пакета — чем больше пакет, тем больше звёзд, как StarsStackedStars в tweb.
function stackedStars(amount) {
  const count = amount >= 2500 ? 6 : amount >= 1000 ? 5 : amount >= 500 ? 4 : amount >= 250 ? 3 : amount >= 50 ? 2 : 1;
  return el(
    "span",
    { class: "tw-stars-stacked", style: `--count: ${count}` },
    Array.from({ length: count }, (_, i) => el("span", { class: "tw-stars-stacked-item", html: starIconSvg(i !== count - 1) }))
  );
}

function twSection(name, children, caption) {
  return el("div", { class: "tw-section-group" }, [
    name ? el("p", { class: "tw-section-name" }, name) : null,
    el("div", { class: "tw-section" }, children),
    caption ? el("p", { class: "tw-section-caption" }, caption) : null,
  ]);
}

// Содержимое «Звёзд» в духе popup-stars из tweb. Одно и то же и на странице настроек, и во всплывающем окне.
export function StarsPanel({ onChanged, onNavigate } = {}) {
  let data = null;
  let error = null;
  let notice = null;
  let busy = false;
  let transferTo = null;
  let found = [];
  let showAllPacks = false;

  const root = el("div", { class: "tw-stars" });

  async function load() {
    try {
      data = await api.getStars();
    } catch (err) {
      error = err.message || "Не удалось загрузить баланс";
    }
    render();
  }

  async function buy(pack) {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const res = await api.requestStars(pack.id);
      if (res.granted) {
        notice = `Начислено ${pack.stars} ⭐`;
        data = await api.getStars();
        onChanged?.();
      } else if (res.donationUrl) {
        handlePurchaseResponse(res);
        return;
      } else if (res.chatId) {
        onNavigate?.();
        navigate(`/chat/${res.chatId}`);
        return;
      }
    } catch (err) {
      error = err.message || "Не удалось оформить покупку";
    } finally {
      busy = false;
      render();
    }
  }

  const priceInput = el("input", { class: "settings-input mono", type: "number", min: "0", step: "1" });

  async function savePrice() {
    error = null;
    notice = null;
    try {
      const { messagePriceStars } = await api.setMessagePrice(Number(priceInput.value));
      data.messagePriceStars = messagePriceStars;
      notice = messagePriceStars > 0 ? `Незнакомцы платят ${messagePriceStars} ⭐ за сообщение` : "Писать вам могут все бесплатно";
      onChanged?.();
    } catch (err) {
      error = err.message || "Не удалось сохранить";
    }
    render();
  }

  const toInput = el("input", { class: "settings-input", type: "text", placeholder: "Имя или @ник" });
  const amountInput = el("input", { class: "settings-input mono", type: "number", min: "1", step: "1", placeholder: "Сколько ⭐" });

  let searchTimer = null;
  toInput.oninput = () => {
    transferTo = null;
    const q = toInput.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      found = [];
      renderFound();
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await api.search(q);
        found = (res.users || []).filter((u) => u.id !== data?.userId).slice(0, 4);
      } catch {
        found = [];
      }
      renderFound();
    }, 250);
  };

  const foundEl = el("div", { class: "stars-transfer-found" });

  function renderFound() {
    clear(foundEl);
    if (transferTo) {
      appendAll(foundEl, el("p", { class: "settings-toggle-hint" }, `Получатель: ${transferTo.name}`));
      return;
    }
    appendAll(
      foundEl,
      ...found.map((u) =>
        el(
          "button",
          {
            class: "stars-transfer-candidate",
            onclick: () => {
              transferTo = u;
              toInput.value = u.name;
              found = [];
              renderFound();
            },
          },
          u.username ? `${u.name} · @${u.username}` : u.name
        )
      )
    );
  }

  async function sendTransfer() {
    if (busy) return;
    error = null;
    notice = null;
    const amount = Math.floor(Number(amountInput.value));
    if (!transferTo) {
      const q = toInput.value.trim().replace(/^@/, "").toLowerCase();
      transferTo =
        found.find((u) => (u.username || "").toLowerCase() === q) ??
        (found.length === 1 ? found[0] : null);
    }
    if (!transferTo) {
      error = found.length ? "Выберите получателя из списка" : "Никого не нашлось по этому имени или @нику";
      render();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      error = "Укажите сумму больше нуля";
      render();
      return;
    }
    busy = true;
    render();
    try {
      const res = await api.transferStars(transferTo.id, amount);
      notice = `Отправлено ${res.amount} ⭐ — ${transferTo.name}`;
      data.balance = res.balance;
      transferTo = null;
      toInput.value = "";
      amountInput.value = "";
      onChanged?.();
    } catch (err) {
      error = err.message || "Не удалось перевести";
    } finally {
      busy = false;
      render();
      renderFound();
    }
  }

  function costRow(icon, color, title, subtitle) {
    return el("div", { class: "tw-row" }, [
      el("span", { class: "tw-row-media", style: `background: ${color}`, html: iconSvg(icon, 20) }),
      el("span", { class: "tw-row-body" }, [
        el("span", { class: "tw-row-title" }, title),
        subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null,
      ]),
    ]);
  }

  function render() {
    clear(root);
    const intro = el("div", { class: "tw-stars-intro" }, [
      el("img", { class: "tw-stars-image", src: "/img/tweb/stars.png", alt: "", width: 194, height: 110 }),
      el("h2", { class: "tw-media-title" }, "Звёзды"),
      el("p", { class: "tw-media-subtitle" }, "Платите за сообщения незнакомцам, поднимайте свои сообщения и дарите подарки."),
    ]);
    if (!data) {
      appendAll(root, intro, el("p", { class: error ? "login-error tw-center" : "settings-toggle-hint tw-center" }, error || "Загружаем…"));
      return;
    }
    priceInput.value = String(data.messagePriceStars ?? 0);

    const packs = data.packs ?? [];
    const visiblePacks = showAllPacks ? packs : packs.slice(0, 6);
    const lonely = visiblePacks.length % 2 === 1;

    appendAll(
      root,
      ...[
        intro,
        el("div", { class: "tw-stars-balance" }, [
          el("span", { class: "tw-stars-balance-title" }, "Баланс"),
          el("span", { class: "tw-stars-balance-value" }, [el("span", { html: starIconSvg() }), String(data.balance)]),
        ]),
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error tw-center" }, error) : null,

        twSection(
          "Купить звёзды",
          [
            el(
              "div",
              { class: "tw-stars-options" },
              visiblePacks.map((p, i) =>
                el(
                  "button",
                  { class: `tw-stars-option${lonely && i === visiblePacks.length - 1 ? " full" : ""}`, disabled: busy, onclick: () => buy(p) },
                  [
                    el("span", { class: "tw-stars-option-title" }, [`+${p.stars}`, stackedStars(p.stars)]),
                    el("span", { class: "tw-stars-option-subtitle" }, `${p.priceRub} ₽`),
                  ]
                )
              )
            ),
            packs.length > 6 && !showAllPacks
              ? el(
                  "button",
                  {
                    class: "tw-stars-more",
                    onclick: () => {
                      showAllPacks = true;
                      render();
                    },
                  },
                  ["Больше вариантов", el("span", { html: iconSvg("ChevronRight", 18) })]
                )
              : null,
          ],
          "Оплата переводом администрации — заявка создастся автоматически, звёзды придут после подтверждения."
        ),

        twSection(
          "Перевести звёзды",
          [
            el("div", { class: "tw-section-pad" }, [
              toInput,
              foundEl,
              el("div", { class: "stars-price-row" }, [
                amountInput,
                el("button", { class: "btn-accent", disabled: busy, onclick: sendTransfer }, "Отправить"),
              ]),
            ]),
          ],
          "Звёзды уйдут с вашего баланса, получателю придёт сообщение о переводе."
        ),

        twSection("На что тратятся", [
          costRow("Zap", "#ef6922", "Поднять своё сообщение", `${data.costs.boost} ⭐ на ${data.costs.boostMinutes} мин.`),
          costRow("Trash", "#db374b", "Удалить чужое сообщение в личке", `${data.costs.delete} ⭐`),
          costRow("MessageSquare", "#8958ff", "Написать тому, кто берёт плату", "Цену назначает получатель"),
          costRow("Gift", "#4492ff", "Подарки", "Магазин подарков — цены в звёздах"),
        ]),

        twSection(
          "Плата за сообщения мне",
          [
            el("div", { class: "tw-section-pad" }, [
              el("div", { class: "stars-price-row" }, [priceInput, el("button", { class: "btn-accent", onclick: savePrice }, "Сохранить")]),
            ]),
          ],
          `Сколько звёзд платит тот, кто пишет вам впервые. 0 — бесплатно для всех. Ваши контакты и те, кому вы уже отвечали, не платят никогда. Максимум ${data.costs.maxMessagePrice} ⭐.`
        ),
      ].filter(Boolean)
    );
  }

  render();
  load();
  return root;
}

export function openStarsDialog(onChanged) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const dialog = el("div", { class: "modal-dialog tw-popup tw-popup-stars" }, [
    el("div", { class: "tw-popup-header" }, [
      el("button", { class: "tw-popup-close", title: "Закрыть", html: iconSvg("X", 22), onclick: () => close() }),
    ]),
    el("div", { class: "tw-popup-body" }, [StarsPanel({ onChanged, onNavigate: () => close() })]),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
}
