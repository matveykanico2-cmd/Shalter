import { el, clear } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

// Исключения из одного правила конфиденциальности (Настройки →
// Конфиденциальность). Правило говорит «все», «мои контакты» или «никто» — а
// здесь называют тех, к кому оно не относится:
//
//   «Всегда можно»  — видит (или может позвонить, добавить, написать) даже
//                     тогда, когда правило это запрещает;
//   «Никогда»       — не видит, даже когда правило разрешает всем.
//
// Запрет сильнее разрешения — тот же порядок, что и на сервере
// (server/lib/privacyRules.js), и он же объяснён подписью в окне.
//
// users — список всех, кого можно выбрать (из api.listUsers()); value —
// { allow, deny } с идентификаторами; onSave получает такую же пару.
export function openPrivacyExceptionsDialog({ title, users, value, onSave }) {
  const allow = new Set(value?.allow ?? []);
  const deny = new Set(value?.deny ?? []);
  const byId = new Map(users.map((u) => [u.id, u]));

  // Список контактов виден сразу, без единого нажатия по клавиатуре. Пустое
  // поле поиска на этом месте требовало угадать имя, прежде чем показать хоть
  // кого-то, — а исключения делают ровно для тех, с кем и так переписываются.
  // Поиск остаётся, но уже как фильтр: он же достаёт и тех, кого в контактах
  // нет (по имени или @юзернейму среди всех аккаунтов).
  let contacts = null; // null — ещё грузятся, [] — контактов нет
  api
    .listContacts()
    .then((r) => {
      contacts = (r.contacts ?? []).map((c) => c.user).filter(Boolean);
      renderResults();
    })
    .catch(() => {
      contacts = [];
      renderResults();
    });

  let query = "";
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const chosenSlot = el("div", { class: "privacy-exc-chosen" });
  const resultsSlot = el("div", { class: "privacy-exc-results" });
  const search = el("input", {
    class: "settings-input",
    type: "search",
    placeholder: "Поиск по контактам и аккаунтам",
    oninput: (e) => {
      query = e.target.value;
      renderResults();
    },
  });

  function nameOf(u) {
    return u.name || u.username || u.phone || "Без имени";
  }

  // Строка человека: аватар, имя и две кнопки-состояния. Обе — переключатели, а
  // не «добавить в список»: назначить человеку и то и другое сразу нельзя, и
  // нажатие на уже выбранное состояние снимает его.
  function personRow(u) {
    const state = deny.has(u.id) ? "deny" : allow.has(u.id) ? "allow" : "";
    const set = (next) => {
      allow.delete(u.id);
      deny.delete(u.id);
      if (next === "allow") allow.add(u.id);
      if (next === "deny") deny.add(u.id);
      renderChosen();
      renderResults();
    };
    return el("div", { class: `privacy-exc-row ${state}` }, [
      Avatar({ name: nameOf(u), color: u.avatarColor, image: u.avatarImage, size: 32 }),
      el("div", { class: "privacy-exc-row-body" }, [
        el("p", { class: "privacy-exc-name" }, nameOf(u)),
        u.username ? el("p", { class: "mono settings-toggle-hint" }, `@${u.username}`) : null,
      ]),
      el(
        "button",
        {
          class: `privacy-exc-btn allow ${state === "allow" ? "active" : ""}`,
          title: "Всегда можно",
          onclick: () => set(state === "allow" ? "" : "allow"),
        },
        [el("span", { html: iconSvg("Check", 14) })]
      ),
      el(
        "button",
        {
          class: `privacy-exc-btn deny ${state === "deny" ? "active" : ""}`,
          title: "Никогда",
          onclick: () => set(state === "deny" ? "" : "deny"),
        },
        [el("span", { html: iconSvg("X", 14) })]
      ),
    ]);
  }

  // Уже выбранные — всегда наверху и всегда видны, независимо от поиска: иначе
  // единственный способ вспомнить, кого ты когда-то внёс в список, — угадать
  // его имя в строке поиска.
  function renderChosen() {
    clear(chosenSlot);
    const groups = [
      { ids: [...allow], label: "Всегда можно", cls: "allow" },
      { ids: [...deny], label: "Никогда", cls: "deny" },
    ];
    let any = false;
    for (const g of groups) {
      if (!g.ids.length) continue;
      any = true;
      chosenSlot.appendChild(el("p", { class: `privacy-exc-group ${g.cls}` }, `${g.label} — ${g.ids.length}`));
      for (const id of g.ids) {
        const u = byId.get(id);
        chosenSlot.appendChild(u ? personRow(u) : unknownRow(id, g.cls));
      }
    }
    if (!any) chosenSlot.appendChild(el("p", { class: "empty-hint" }, "Исключений нет — правило действует на всех одинаково"));
  }

  // Аккаунт из списка мог исчезнуть (удалён, забанен) — оставлять запись без
  // возможности её убрать нельзя, поэтому строка рисуется и без пользователя.
  function unknownRow(id, cls) {
    return el("div", { class: `privacy-exc-row ${cls}` }, [
      el("div", { class: "privacy-exc-row-body" }, [el("p", { class: "privacy-exc-name" }, "Удалённый аккаунт")]),
      el(
        "button",
        {
          class: "privacy-exc-btn",
          title: "Убрать из списка",
          onclick: () => {
            allow.delete(id);
            deny.delete(id);
            renderChosen();
          },
        },
        [el("span", { html: iconSvg("Trash", 14) })]
      ),
    ]);
  }

  // Уже выбранные здесь не повторяются: они стоят выше, отдельными списками и
  // со своим состоянием, — а одна и та же строка дважды в одном окне выглядит
  // как две разные записи про одного человека.
  const notChosen = (u) => !allow.has(u.id) && !deny.has(u.id);
  const matches = (u, q) => nameOf(u).toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q);

  function renderResults() {
    clear(resultsSlot);
    const q = query.trim().toLowerCase();

    if (!q) {
      if (contacts === null) {
        resultsSlot.appendChild(el("p", { class: "settings-toggle-hint" }, "Загружаем контакты…"));
        return;
      }
      const list = contacts.filter(notChosen);
      if (!list.length) {
        resultsSlot.appendChild(
          el(
            "p",
            { class: "empty-hint" },
            contacts.length
              ? "Все ваши контакты уже в списках выше"
              : "Список контактов пуст — найдите человека по имени или @юзернейму"
          )
        );
        return;
      }
      resultsSlot.appendChild(el("p", { class: "privacy-exc-group" }, `Ваши контакты — ${list.length}`));
      for (const u of list) resultsSlot.appendChild(personRow(u));
      return;
    }

    // С запросом ищем шире контактов: в исключения вносят и тех, кого в
    // контактах нет, — именно ради них («номер видят все, кроме вот этого»).
    const contactIds = new Set((contacts ?? []).map((u) => u.id));
    const found = users.filter(notChosen).filter((u) => matches(u, q));
    const mine = found.filter((u) => contactIds.has(u.id));
    const others = found.filter((u) => !contactIds.has(u.id)).slice(0, 30);

    if (!mine.length && !others.length) {
      resultsSlot.appendChild(el("p", { class: "empty-hint" }, "Никого не найдено — возможно, они уже в списках выше"));
      return;
    }
    if (mine.length) {
      resultsSlot.appendChild(el("p", { class: "privacy-exc-group" }, "Из ваших контактов"));
      for (const u of mine) resultsSlot.appendChild(personRow(u));
    }
    if (others.length) {
      resultsSlot.appendChild(el("p", { class: "privacy-exc-group" }, "Остальные аккаунты"));
      for (const u of others) resultsSlot.appendChild(personRow(u));
    }
  }

  const dialog = el("div", { class: "modal-dialog privacy-exc-dialog" }, [
    el("h2", { class: "modal-title" }, title),
    el(
      "p",
      { class: "settings-toggle-hint" },
      "«Всегда можно» действует даже когда правило запрещает, «Никогда» — даже когда правило разрешает всем. Запрет сильнее разрешения."
    ),
    chosenSlot,
    search,
    resultsSlot,
    el(
      "button",
      {
        class: "btn-accent",
        onclick: () => {
          close();
          onSave({ allow: [...allow], deny: [...deny] });
        },
      },
      "Сохранить"
    ),
    el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
  ]);
  overlay.appendChild(dialog);

  function close() {
    overlay.remove();
  }

  renderChosen();
  renderResults();
  document.body.appendChild(overlay);
}
