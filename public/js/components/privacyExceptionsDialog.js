import { el, clear } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

export function openPrivacyExceptionsDialog({ title, users = [], value, onSave }) {
  const allow = new Set(value?.allow ?? []);
  const deny = new Set(value?.deny ?? []);
  const byId = new Map(users.map((u) => [u.id, u]));
  const remember = (list) => {
    for (const u of list ?? []) if (u?.id) byId.set(u.id, u);
  };

  let contacts = null;
  api
    .listContacts()
    .then((r) => {
      contacts = (r.contacts ?? []).map((c) => c.user).filter(Boolean);
      renderResults().catch(() => {});
    })
    .catch(() => {
      contacts = [];
      renderResults().catch(() => {});
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
      renderResults().catch(() => {});
    },
  });

  function nameOf(u) {
    return u.name || u.username || u.phone || "Без имени";
  }

  function personRow(u) {
    const state = deny.has(u.id) ? "deny" : allow.has(u.id) ? "allow" : "";
    const set = (next) => {
      allow.delete(u.id);
      deny.delete(u.id);
      if (next === "allow") allow.add(u.id);
      if (next === "deny") deny.add(u.id);
      renderChosen();
      renderResults().catch(() => {});
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

  const notChosen = (u) => !allow.has(u.id) && !deny.has(u.id);
  const matches = (u, q) => nameOf(u).toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q);

  async function renderResults() {
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

    const contactIds = new Set((contacts ?? []).map((u) => u.id));
    const mine = (contacts ?? []).filter(notChosen).filter((u) => matches(u, q));
    const asked = q;
    let others = [];
    try {
      const res = await api.search(q);
      if (asked !== search.value.trim().toLowerCase()) return;
      remember(res.users);
      others = (res.users ?? []).filter(notChosen).filter((u) => !contactIds.has(u.id));
    } catch {
    }

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
  renderResults().catch(() => {});
  document.body.appendChild(overlay);
}
