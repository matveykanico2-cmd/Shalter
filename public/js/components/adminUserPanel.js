import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { SAFETY_LABELS } from "../lib/safetyLabels.js";

// Premium durations offered on the profile. There's no payment gateway here
// (see AGENTS.md): the buyer transfers the money and says so in chat, and the
// admin hands the purchase over from here.
const PREMIUM_DURATIONS = [
  { label: "30 дней", opts: { days: 30 } },
  { label: "90 дней", opts: { days: 90 } },
  { label: "365 дней", opts: { days: 365 } },
  { label: "Навсегда", opts: { forever: true } },
];
const ADS_DURATIONS = [
  { label: "30 дней", opts: { days: 30 } },
  { label: "90 дней", opts: { days: 90 } },
  { label: "Навсегда", opts: { forever: true } },
];

function untilLabel({ active, forever, until }) {
  if (!active) return "не активен";
  if (forever) return "навсегда";
  return until ? `активен до ${new Date(until).toLocaleDateString("ru-RU")}` : "активен";
}

const STATUS_LABELS = {
  open: "открыта",
  resolved_deleted: "контент удалён",
  resolved_banned: "аккаунт заблокирован",
  dismissed: "отклонена",
};

// Per-user admin panel, opened from a profile (profileDialog.js) by whoever
// holds ADMIN_PHONE. Everything here is also gated server-side
// (server/routes/admin.js) — this is the UI, not the permission check.
//
// One screen for everything the admin does *to one account*: hand over a
// purchase someone has transferred for (Premium, кабинет рекламы, a gift),
// mark or ban them, read what they've been reported for, and export their data
// on a lawful request.
//
// It exists because all of that used to be scattered and half-missing. Granting
// Premium lived only in an open DM's info panel (30 days, no other duration, no
// ads cabinet); banning was only reachable from a report notification in the
// admin's service chat, with no screen anywhere that could *un*-ban or show
// what the ban was for; and the data export was on its own settings page keyed
// by re-typing the person's handle.
export function openAdminUserPanel(user, onChange) {
  let state = { ...user };
  let reports = null; // null = not loaded yet
  let reportsError = null;
  let gifts = [];
  let busy = false;
  let error = null;
  let notice = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "admin-panel-body" });
  const dialog = el("div", { class: "modal-dialog admin-panel-dialog" }, [
    el("h2", { class: "modal-title" }, `Управление: ${state.name}`),
    bodyEl,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  // Every action funnels through here so the busy flag, error slot and the
  // parent profile's refresh all behave the same way regardless of which
  // button was pressed.
  async function run(fn, successNotice) {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      const result = (await fn()) ?? {};
      if (result.patch) {
        state = { ...state, ...result.patch };
        onChange?.(result.patch);
      }
      notice = result.notice ?? successNotice ?? null;
    } catch (err) {
      error = err.message || "Не удалось выполнить действие";
    } finally {
      busy = false;
      render();
    }
  }

  // Loaded on open, not behind a button, because this response is also the
  // only source of banReason: publicUser (server/data/sanitize.js) strips it
  // from every ordinary profile fetch, so without this the panel would show
  // "Причина: не указана" for a ban that has one — the exact thing the admin
  // opened this to read.
  async function loadReports() {
    reportsError = null;
    try {
      const res = await api.adminUserReports(state.id);
      reports = res.reports;
      state = { ...state, ...res.user };
    } catch (err) {
      reportsError = err.message || "Не удалось загрузить жалобы";
    }
    // Best-effort: the gift catalog only powers one optional menu, so failing
    // to load it must not take the rest of the panel down with it.
    try {
      ({ gifts } = await api.listGifts());
    } catch {}
    render();
  }

  // ── Handing over a purchase ────────────────────────────────────────────────
  // The buyer transfers the money (they've just sent "перевожу на <номер>" into
  // the admin's DM — see server/routes/premium.js's /request) and the admin
  // grants it here, on that person's profile, instead of having to find the
  // right chat and remember which endpoint to poke.
  function grantPremium(opts, label) {
    run(async () => {
      const { user: updated } = await api.grantPremium(state.id, true, opts);
      return { patch: { isPremium: !!updated.isPremium, premiumUntil: updated.premiumUntil ?? null, premiumForever: !!updated.premiumForever } };
    }, `Premium выдан (${label}) — пользователь уведомлён в чате.`);
  }

  function revokePremium() {
    run(async () => {
      const { user: updated } = await api.grantPremium(state.id, false);
      return { patch: { isPremium: !!updated.isPremium, premiumUntil: updated.premiumUntil ?? null, premiumForever: !!updated.premiumForever } };
    }, "Premium отключён — пользователь уведомлён в чате.");
  }

  function grantAds(opts, label) {
    run(async () => {
      const { user: updated } = await api.grantAds(state.id, true, opts);
      return { patch: { isAdsActive: !!updated.isAdsActive, adsUntil: updated.adsUntil ?? null, adsForever: !!updated.adsForever } };
    }, `Кабинет рекламы выдан (${label}) — пользователь уведомлён в чате.`);
  }

  function revokeAds() {
    run(async () => {
      const { user: updated } = await api.grantAds(state.id, false);
      return { patch: { isAdsActive: !!updated.isAdsActive, adsUntil: updated.adsUntil ?? null, adsForever: !!updated.adsForever } };
    }, "Кабинет рекламы отключён — пользователь уведомлён в чате.");
  }

  function sendGift(gift) {
    run(async () => {
      await api.deliverGift(gift.id, state.id);
      return {};
    }, `Подарок ${gift.emoji} «${gift.name}» отправлен.`);
  }

  // Duration pills, one row per product.
  function durationRow(durations, onPick) {
    return el(
      "div",
      { class: "admin-label-grid" },
      durations.map((d) => el("button", { class: "admin-label-btn", disabled: busy, onclick: () => onPick(d.opts, d.label) }, d.label))
    );
  }

  // The lawful-request export (server/data/dataExport.js). The reason is
  // mandatory server-side — asked for here rather than silently sending a
  // blank one, since it's what makes the audit journal worth having. The file
  // is built in memory and downloaded straight from this tab; nothing is
  // written server-side except the audit row.
  function runExport() {
    const reason = prompt(
      `Основание для выгрузки данных ${state.name} (номер дела / реквизиты постановления).\nОно будет записано в журнал выгрузок.`
    );
    if (reason == null || !reason.trim()) return;
    run(async () => {
      const { exportId, data } = await api.adminExportUser(state.id, reason.trim());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = el("a", { href: url, download: `export_${state.username || state.id}_${exportId}.json` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { notice: `Файл выгружен (${data.stats.messageCount} сообщений, чатов: ${data.stats.chatCount}). Запись в журнале: ${exportId}.` };
    });
  }

  function toggleBan() {
    if (state.isBanned) {
      run(async () => {
        const { user: updated } = await api.adminSetBanned(state.id, false);
        return { patch: { banReason: null, bannedAt: null, ...updated } };
      }, "Блокировка снята — пользователь уведомлён в чате с Shalter.");
      return;
    }
    const reason = prompt(`Причина блокировки ${state.name}. Её увидит сам пользователь на экране входа.`);
    if (reason == null || !reason.trim()) return;
    run(async () => {
      const { user: updated } = await api.adminSetBanned(state.id, true, reason.trim());
      return { patch: updated };
    }, "Аккаунт заблокирован — пользователь уведомлён в чате с Shalter.");
  }

  function setLabel(label) {
    run(async () => {
      const { user: updated } = await api.adminSetSafetyLabel(state.id, label);
      return { patch: { safetyLabel: updated.safetyLabel ?? null } };
    }, label ? "Метка установлена — она видна всем в профиле и в списке чатов." : "Метка снята.");
  }

  function reportRow(r) {
    return el("div", { class: "admin-report-row" }, [
      el("div", { class: "admin-report-head" }, [
        el("span", { class: "admin-report-reason" }, r.reasonLabel),
        el("span", { class: "mono admin-report-date" }, new Date(r.at).toLocaleString("ru-RU")),
      ]),
      el("p", { class: "admin-report-meta" }, `От: ${r.reporter.name} · статус: ${STATUS_LABELS[r.status] ?? r.status}`),
      r.quoted ? el("p", { class: "admin-report-quote" }, `«${r.quoted}»`) : null,
      r.details ? el("p", { class: "admin-report-details" }, `Пояснение: ${r.details}`) : null,
    ]);
  }

  function render() {
    clear(bodyEl);
    const children = [
      el("p", { class: "admin-panel-subtitle" }, [
        state.username ? `@${state.username}` : state.id,
        state.isBanned ? el("span", { class: "admin-panel-flag danger" }, "заблокирован") : null,
        state.safetyLabel ? el("span", { class: "admin-panel-flag" }, SAFETY_LABELS[state.safetyLabel]?.short ?? state.safetyLabel) : null,
        state.isVerified ? el("span", { class: "admin-panel-flag" }, "верифицирован") : null,
      ]),

      // Выдача покупок. First section on purpose: this is the thing the admin
      // opens a profile for most often — someone transferred 10₽ and is waiting.
      el("p", { class: "admin-panel-section-title" }, "Выдать покупку"),
      el("p", { class: "settings-toggle-hint" }, "Оплата — обычным переводом на телефон администрации. Получив перевод, выдайте купленное здесь: пользователю придёт уведомление в чат."),
      el("p", { class: "admin-grant-status" }, [
        el("span", {}, "Shalter Premium"),
        el("span", { class: "admin-grant-state" }, untilLabel({ active: state.isPremium, forever: state.premiumForever, until: state.premiumUntil })),
      ]),
      durationRow(PREMIUM_DURATIONS, grantPremium),
      state.isPremium
        ? el("button", { class: "settings-danger-link", disabled: busy, onclick: revokePremium }, "Забрать Premium")
        : null,
      el("p", { class: "admin-grant-status" }, [
        el("span", {}, "Кабинет рекламы"),
        el("span", { class: "admin-grant-state" }, untilLabel({ active: state.isAdsActive, forever: state.adsForever, until: state.adsUntil })),
      ]),
      durationRow(ADS_DURATIONS, grantAds),
      state.isAdsActive
        ? el("button", { class: "settings-danger-link", disabled: busy, onclick: revokeAds }, "Забрать кабинет рекламы")
        : null,
      gifts.length
        ? el(
            "button",
            {
              class: "profile-action-btn admin-gift-btn",
              disabled: busy,
              onclick: (e) =>
                openDropdownMenu(
                  { x: e.clientX, y: e.clientY },
                  gifts.map((g) => ({
                    // In stars, because that's the price the recipient would
                    // have paid — the shop hasn't been priced in roubles since
                    // stars became the currency.
                    label: `${g.emoji} ${g.name} — ⭐ ${g.priceStars}${g.supply ? ` (осталось ${g.remaining})` : ""}`,
                    onClick: () => sendGift(g),
                  })),
                  { search: "Поиск подарка" }
                ),
            },
            "🎁 Отправить подарок"
          )
        : null,

      el("p", { class: "admin-panel-section-title" }, "Звёзды"),
      el("p", { class: "settings-toggle-hint" }, "Начислить после перевода — или списать, указав отрицательное число."),
      (() => {
        // Uncontrolled input read on submit: the panel re-renders after every
        // action, and a controlled field would lose focus mid-typing.
        const input = el("input", { class: "settings-input mono", type: "number", step: "1", placeholder: "например 130" });
        return el("div", { class: "admin-stars-row" }, [
          input,
          el(
            "button",
            {
              class: "btn-accent-pill",
              disabled: busy,
              onclick: () =>
                run(async () => {
                  const amount = Number(input.value);
                  if (!amount) throw new Error("Укажите количество звёзд");
                  const { balance } = await api.grantStars(state.id, amount);
                  return { notice: `Баланс: ${balance} ⭐` };
                }, "Звёзды начислены"),
            },
            "Начислить"
          ),
        ]);
      })(),

      el("p", { class: "admin-panel-section-title" }, "Верификация"),
      el("p", { class: "settings-toggle-hint" }, "Галочка рядом с именем — «мы проверили, кто за этим аккаунтом». Это не отметка о безопасности: для предупреждений есть метка ниже."),
      el(
        "button",
        {
          class: `btn-accent ${state.isVerified ? "danger" : ""}`,
          disabled: busy,
          onclick: () =>
            run(async () => {
              const { user: updated } = await api.adminSetVerified(state.id, !state.isVerified);
              return { patch: { isVerified: !!updated.isVerified } };
            }, state.isVerified ? "Галочка снята." : "Аккаунт верифицирован — пользователь уведомлён."),
        },
        state.isVerified ? "Снять галочку" : "Верифицировать"
      ),

      el("p", { class: "admin-panel-section-title" }, "Метка безопасности"),
      el("p", { class: "settings-toggle-hint" }, "Видна всем, кто откроет профиль или увидит чат с этим аккаунтом — предупреждение до того, как человек переведёт деньги."),
      el(
        "div",
        { class: "admin-label-grid" },
        [
          el(
            "button",
            {
              class: `admin-label-btn ${!state.safetyLabel ? "active" : ""}`,
              disabled: busy,
              onclick: () => setLabel(""),
            },
            "Без метки"
          ),
          ...Object.entries(SAFETY_LABELS).map(([key, info]) =>
            el(
              "button",
              {
                class: `admin-label-btn ${state.safetyLabel === key ? "active" : ""}`,
                disabled: busy,
                title: info.hint,
                onclick: () => setLabel(key),
              },
              info.label
            )
          ),
        ]
      ),

      el("p", { class: "admin-panel-section-title" }, "Блокировка"),
      state.isBanned
        ? el("p", { class: "settings-toggle-hint" }, `Заблокирован ${state.bannedAt ? new Date(state.bannedAt).toLocaleString("ru-RU") : ""}. Причина: ${state.banReason || "не указана"}`)
        : el("p", { class: "settings-toggle-hint" }, "Заблокированный аккаунт не сможет войти и увидит причину на экране входа."),
      el(
        "button",
        { class: `btn-accent ${state.isBanned ? "" : "danger"}`, disabled: busy, onclick: toggleBan },
        state.isBanned ? "Разблокировать" : "Заблокировать"
      ),

      el("p", { class: "admin-panel-section-title" }, "Жалобы на этот аккаунт"),
      reports === null
        ? el("p", { class: "settings-toggle-hint" }, "Загружаем…")
        : reports.length === 0
          ? el("p", { class: "settings-toggle-hint" }, "Жалоб на этот аккаунт нет")
          : el("div", { class: "admin-reports-list" }, reports.map(reportRow)),
      reportsError ? el("p", { class: "login-error" }, reportsError) : null,

      el("p", { class: "admin-panel-section-title" }, "Данные аккаунта"),
      el("p", { class: "settings-toggle-hint" }, "Выгрузка всех хранимых данных этого пользователя (чаты и сообщения) одним файлом. Требует основания и записывается в журнал выгрузок."),
      el("button", { class: "profile-action-btn", disabled: busy, onclick: runExport }, [
        el("span", { html: iconSvg("Download", 14) }),
        " Экспорт данных",
      ]),

      error ? el("p", { class: "login-error" }, error) : null,
      notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
    ];
    bodyEl.append(...children.filter(Boolean));
  }

  render();
  loadReports();
}
