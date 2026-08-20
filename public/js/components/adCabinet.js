import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

// Рекламный кабинет: список кампаний, деньги и статистика.
//
// Вынесен в свой файл, а не дописан в экран настроек: там уже двадцать
// разделов в одном файле, а кабинет — это отдельная работа со своим состоянием
// (черновик, проверка, показ, пауза) и своими числами.

const STATUS = {
  draft: { label: "Черновик", tone: "muted", hint: "Ещё не отправлено на проверку" },
  review: { label: "На проверке", tone: "warn", hint: "Администратор смотрит объявление" },
  active: { label: "Идёт показ", tone: "ok", hint: "Объявление показывается и тратит бюджет" },
  paused: { label: "На паузе", tone: "muted", hint: "Проверено, но показ выключен" },
  rejected: { label: "Отклонено", tone: "danger", hint: "Исправьте текст и отправьте снова" },
  finished: { label: "Бюджет закончился", tone: "muted", hint: "Пополните бюджет, чтобы продолжить" },
};

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(n ?? 0);
// CTR — доля нажавших от увидевших. Без неё показы и клики читаются порознь и
// не отвечают на вопрос «работает ли объявление».
const ctr = (c) => (c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(1) : "0.0");

export function AdCabinet(root) {
  let data = null;
  let error = null;
  let editing = null; // id редактируемой кампании или "new"
  let statsFor = null;
  let stats = null;
  let busy = false;

  async function load() {
    try {
      data = await api.listAdCampaigns();
      error = null;
    } catch (err) {
      error = err.message || "Не удалось загрузить кабинет";
    }
    render();
  }

  async function act(fn) {
    if (busy) return;
    busy = true;
    render();
    try {
      await fn();
      await load();
    } catch (err) {
      error = err.message || "Не получилось";
    } finally {
      busy = false;
      render();
    }
  }

  // Форма кампании. Поля живут вне render(), иначе перерисовка после каждого
  // нажатия отбирала бы фокус — тот самый ввод «по одной букве».
  const fields = {
    title: el("input", { class: "settings-input", placeholder: "Название — только для вас, например «Осенняя распродажа»" }),
    text: el("textarea", { class: "settings-input", rows: 3, maxlength: 200, placeholder: "Текст объявления — до 200 символов" }),
    url: el("input", { class: "settings-input mono", placeholder: "Ссылка: https://…" }),
    cpm: el("input", { class: "settings-input mono", type: "number", min: 5, value: "20" }),
  };
  let placement = "discover";

  function fillForm(c) {
    fields.title.value = c?.title ?? "";
    fields.text.value = c?.text ?? "";
    fields.url.value = c?.url ?? "";
    fields.cpm.value = String(c?.cpmStars ?? 20);
    placement = c?.placement ?? "discover";
  }

  function form(c) {
    const isNew = !c;
    return el("div", { class: "ad-form" }, [
      el("p", { class: "settings-field-label" }, "Название кампании"),
      fields.title,
      el("p", { class: "settings-field-label" }, "Объявление"),
      fields.text,
      el("p", { class: "settings-field-label" }, "Ссылка"),
      fields.url,
      el("p", { class: "settings-field-label" }, "Где показывать"),
      el(
        "div",
        { class: "ad-placements" },
        Object.entries(data.placements).map(([id, label]) =>
          el(
            "button",
            {
              class: `ad-placement ${placement === id ? "active" : ""}`,
              onclick: () => {
                placement = id;
                render();
              },
            },
            label
          )
        )
      ),
      el("p", { class: "settings-field-label" }, "Цена за 1000 показов, звёзд"),
      fields.cpm,
      el(
        "p",
        { class: "settings-toggle-hint" },
        `Чем больше цена, тем чаще объявление попадает в показ. Минимум — ${data.cpmMin} звёзд за тысячу.`
      ),
      el("div", { class: "ad-form-actions" }, [
        el(
          "button",
          {
            class: "btn-accent",
            disabled: busy,
            onclick: () =>
              act(async () => {
                const payload = {
                  title: fields.title.value,
                  text: fields.text.value,
                  url: fields.url.value,
                  placement,
                  cpmStars: Number(fields.cpm.value),
                };
                if (isNew) await api.createAdCampaign(payload);
                else await api.updateAdCampaign(c.id, payload);
                editing = null;
              }),
          },
          isNew ? "Создать кампанию" : "Сохранить"
        ),
        el("button", { class: "profile-action-btn", onclick: () => { editing = null; render(); } }, "Отмена"),
      ]),
    ]);
  }

  // Небольшой график по дням: столбики показов, чтобы было видно ход кампании,
  // а не одно итоговое число.
  function chart(daily) {
    if (!daily?.length) return el("p", { class: "settings-toggle-hint" }, "Показов пока не было");
    const max = Math.max(...daily.map((d) => d.impressions), 1);
    return el("div", { class: "ad-chart" }, [
      el(
        "div",
        { class: "ad-chart-bars" },
        daily.map((d) =>
          el("div", { class: "ad-chart-col", title: `${d.day}: ${d.impressions} показов, ${d.clicks} кликов` }, [
            el("div", { class: "ad-chart-bar", style: { height: `${Math.max(4, (d.impressions / max) * 100)}%` } }),
            el("span", { class: "ad-chart-day" }, d.day.slice(8)),
          ])
        )
      ),
    ]);
  }

  function campaignCard(c) {
    const st = STATUS[c.status] ?? STATUS.draft;
    const spentPct = c.budgetStars ? Math.min(100, Math.round((c.spentStars / c.budgetStars) * 100)) : 0;
    return el("div", { class: "ad-card" }, [
      el("div", { class: "ad-card-head" }, [
        el("div", { class: "ad-card-titles" }, [
          el("p", { class: "ad-card-title" }, c.title || "Без названия"),
          el("p", { class: "ad-card-place" }, data.placements[c.placement] ?? c.placement),
        ]),
        el("span", { class: `ad-status ${st.tone}` }, st.label),
      ]),
      el("p", { class: "ad-card-text" }, c.text),
      c.rejectReason ? el("p", { class: "login-error" }, `Причина отказа: ${c.rejectReason}`) : null,

      el("div", { class: "ad-stats-row" }, [
        el("div", { class: "ad-stat" }, [el("p", { class: "ad-stat-value" }, fmt(c.impressions)), el("p", { class: "ad-stat-label" }, "показов")]),
        el("div", { class: "ad-stat" }, [el("p", { class: "ad-stat-value" }, fmt(c.clicks)), el("p", { class: "ad-stat-label" }, "кликов")]),
        el("div", { class: "ad-stat" }, [el("p", { class: "ad-stat-value" }, `${ctr(c)}%`), el("p", { class: "ad-stat-label" }, "CTR")]),
        el("div", { class: "ad-stat" }, [el("p", { class: "ad-stat-value" }, `⭐ ${fmt(c.spentStars)}`), el("p", { class: "ad-stat-label" }, "потрачено")]),
      ]),

      el("div", { class: "ad-budget" }, [
        el("div", { class: "ad-budget-bar" }, [el("div", { class: "ad-budget-fill", style: { width: `${spentPct}%` } })]),
        el("p", { class: "settings-toggle-hint" }, `Бюджет ⭐ ${fmt(c.budgetStars)} · осталось ⭐ ${fmt(c.remainingStars)}`),
      ]),

      el("div", { class: "ad-card-actions" }, [
        c.status === "draft" || c.status === "rejected"
          ? el("button", { class: "btn-accent", disabled: busy, onclick: () => act(() => api.setAdCampaignStatus(c.id, "review")) }, "На проверку")
          : null,
        c.status === "paused" || c.status === "finished"
          ? el("button", { class: "btn-accent", disabled: busy, onclick: () => act(() => api.setAdCampaignStatus(c.id, "active")) }, "Включить показ")
          : null,
        c.status === "active"
          ? el("button", { class: "profile-action-btn", disabled: busy, onclick: () => act(() => api.setAdCampaignStatus(c.id, "paused")) }, "Пауза")
          : null,
        el(
          "button",
          {
            class: "profile-action-btn",
            onclick: () => {
              const stars = Number(prompt("Сколько звёзд добавить в бюджет?", "500"));
              if (stars > 0) act(() => api.topUpAdCampaign(c.id, stars));
            },
          },
          "Пополнить"
        ),
        el("button", { class: "profile-action-btn", onclick: () => { editing = c.id; fillForm(c); render(); } }, "Изменить"),
        el(
          "button",
          {
            class: "profile-action-btn",
            onclick: async () => {
              statsFor = statsFor === c.id ? null : c.id;
              stats = null;
              render();
              if (statsFor) {
                stats = await api.adCampaignStats(c.id).catch(() => null);
                render();
              }
            },
          },
          statsFor === c.id ? "Скрыть график" : "График"
        ),
        el(
          "button",
          {
            class: "profile-action-btn danger",
            onclick: () => confirm(`Удалить кампанию «${c.title || "без названия"}»?`) && act(() => api.deleteAdCampaign(c.id)),
          },
          "Удалить"
        ),
      ]),
      statsFor === c.id ? chart(stats?.daily) : null,
      editing === c.id ? form(c) : null,
    ]);
  }

  function render() {
    clear(root);
    if (error && !data) return mount(root, el("p", { class: "login-error" }, error));
    if (!data) return mount(root, el("p", { class: "settings-toggle-hint" }, "Загружаем кабинет…"));

    mount(
      root,
      el("div", {}, [
        el("div", { class: "ad-balance" }, [
          el("span", { html: iconSvg("Zap", 16) }),
          el("p", {}, [el("strong", {}, `⭐ ${fmt(data.balanceStars)}`), " на балансе — из них и оплачивается показ"]),
        ]),
        error ? el("p", { class: "login-error" }, error) : null,

        editing === "new"
          ? form(null)
          : el("button", { class: "btn-accent", onclick: () => { editing = "new"; fillForm(null); render(); } }, [
              el("span", { html: iconSvg("Plus", 15) }),
              "Новая кампания",
            ]),

        data.campaigns.length === 0 && editing !== "new"
          ? el("p", { class: "moderation-empty" }, "Кампаний пока нет. Создайте первую — она уйдёт на проверку, а потом её можно включить.")
          : null,
        ...data.campaigns.map(campaignCard),

        el("div", { class: "settings-notice-box" }, [
          el("p", { class: "settings-toggle-title" }, "Как это устроено"),
          el("p", { class: "settings-toggle-hint" }, "Оплата — звёздами, за показы: цена задаётся за тысячу. Деньги списываются по мере показа, остаток всегда виден в карточке."),
          el("p", { class: "settings-toggle-hint" }, "Каждое объявление проходит проверку до первого показа. Изменили текст — оно уходит на проверку снова."),
          el("p", { class: "settings-toggle-hint" }, "Нацеливания на человека нет: выбрать можно только место показа. Реклама, которая целится в человека, требует слежки за ним, — этого в Shalter не будет."),
        ]),
      ])
    );
  }

  render();
  load();
}
