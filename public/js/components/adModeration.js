import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

const QUICK_REASONS = [
  "Обман или несуществующий товар",
  "Запрещённые товары или услуги",
  "18+ и подобное",
  "Ссылка ведёт не туда, куда обещает текст",
  "Чужой бренд без разрешения",
  "Текст не читается: капс, спам-символы",
];

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

export function AdReviewQueue(root) {
  let list = null;
  let error = null;
  let busy = null;
  let rejecting = null;
  let rejectError = null;
  let placements = {};

  const reasonInput = el("input", { class: "settings-input", placeholder: "Причина отказа — её увидит рекламодатель" });

  async function load() {
    try {
      const data = await api.adsForReview();
      list = data.campaigns ?? [];
      placements = data.placements ?? {};
      error = null;
    } catch (err) {
      error = err.message || "Не удалось загрузить очередь проверки";
      list = [];
    }
    render();
  }

  async function decide(c, approve, reason) {
    busy = c.id;
    rejectError = null;
    render();
    try {
      await api.reviewAd(c.id, approve, reason);
      rejecting = null;
      reasonInput.value = "";
      await load();
    } catch (err) {
      if (approve) error = err.message || "Не получилось";
      else rejectError = err.message || "Не получилось";
    } finally {
      busy = null;
      render();
    }
  }

  function rejectBox(c) {
    return el("div", { class: "ad-review-reject" }, [
      el("p", { class: "settings-field-label" }, "Почему отказ"),
      el(
        "div",
        { class: "ad-review-reasons" },
        QUICK_REASONS.map((r) =>
          el("button", {
            class: "ad-placement",
            onclick: () => {
              reasonInput.value = r;
              reasonInput.focus();
            },
          }, r)
        )
      ),
      reasonInput,
      rejectError ? el("p", { class: "login-error" }, rejectError) : null,
      el("div", { class: "ad-card-actions" }, [
        el("button", {
          class: "profile-action-btn danger",
          disabled: busy === c.id,
          onclick: () => {
            const reason = reasonInput.value.trim();
            if (!reason) {
              rejectError = "Без причины отказ не отправляется — рекламодателю нечего будет исправлять";
              render();
              reasonInput.focus();
              return;
            }
            decide(c, false, reason);
          },
        }, busy === c.id ? "Отправляем…" : "Отклонить объявление"),
        el("button", {
          class: "profile-action-btn",
          onclick: () => {
            rejecting = null;
            rejectError = null;
            render();
          },
        }, "Отмена"),
      ]),
    ]);
  }

  function card(c) {
    const owner = c.owner ?? {};
    return el("div", { class: "ad-card" }, [
      el("div", { class: "ad-card-head" }, [
        el("div", { class: "ad-card-titles" }, [
          el("p", { class: "ad-card-title" }, c.title || "Без названия"),
          el("p", { class: "ad-card-place" }, [
            owner.username ? `@${owner.username}` : owner.name || owner.id,
            ` · ${new Date(c.createdAt).toLocaleString("ru-RU")}`,
          ]),
        ]),
        el("span", { class: "ad-status warn" }, "Ждёт проверки"),
      ]),

      el("p", { class: "ad-card-text" }, c.text),
      c.imageUrl ? el("img", { class: "ad-review-image", src: c.imageUrl, alt: "" }) : null,
      c.url
        ? el("p", { class: "ad-review-link" }, [
            el("span", { html: iconSvg("Globe", 13) }),
            el("a", { class: "mono", href: c.url, target: "_blank", rel: "noopener noreferrer nofollow" }, c.url),
          ])
        : null,

      el(
        "p",
        { class: "settings-toggle-hint" },
        `Место показа: ${placements[c.placement] ?? c.placement} · ⭐ ${fmt(c.cpmStars)} за 1000 показов · бюджет ⭐ ${fmt(c.budgetStars)}`
      ),
      c.rejectReason ? el("p", { class: "settings-toggle-hint" }, `Прошлый отказ: ${c.rejectReason}`) : null,

      rejecting === c.id
        ? rejectBox(c)
        : el("div", { class: "ad-card-actions" }, [
            el("button", {
              class: "btn-accent",
              disabled: busy === c.id,
              onclick: () => decide(c, true, ""),
            }, busy === c.id ? "Отправляем…" : "Проверил"),
            el("button", {
              class: "profile-action-btn danger",
              disabled: busy === c.id,
              onclick: () => {
                rejecting = c.id;
                rejectError = null;
                reasonInput.value = "";
                render();
                reasonInput.focus();
              },
            }, "Отказ"),
          ]),
    ]);
  }

  function render() {
    clear(root);
    const count = list?.length ?? 0;
    mount(root, [
      el("p", { class: "settings-section-title" }, `Реклама на проверке${list ? ` (${count})` : ""}`),
      el("div", { class: "settings-section" }, [
        el(
          "p",
          { class: "settings-toggle-hint" },
          "Объявление уходит сюда сразу, как рекламодатель его создал, и до проверки не показывается никому. «Проверил» ставит кампанию на паузу — включит её владелец сам; «Отказ» возвращает объявление автору с причиной."
        ),
        error ? el("p", { class: "login-error" }, error) : null,
        !list ? el("p", { class: "settings-toggle-hint" }, "Загружаем…") : null,
        list && count === 0 && !error ? el("p", { class: "moderation-empty" }, "Объявлений на проверке нет") : null,
        ...(list ?? []).map(card),
        list && !error
          ? el("button", { class: "profile-action-btn moderation-open-btn", onclick: load }, "Обновить очередь")
          : null,
      ]),
    ]);
  }

  render();
  load();
  return { reload: load };
}
