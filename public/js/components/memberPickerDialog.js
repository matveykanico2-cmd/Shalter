import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openSideTab, twUserCheckRow } from "./twTab.js";
import { timeAgo } from "../lib/presence.js";

// Выбор участников — вкладка tweb «Добавить участников» (AppAddMembersTab):
// поиск с плашками выбранных сверху, контакты с круглыми галочками, круглая кнопка внизу.
export async function openMemberPickerDialog(
  onConfirm,
  { title = "Добавить участников", submitLabel = "Далее", excludeIds = [], allowRoles = false, fabIcon = "ChevronRight", skippable = true } = {}
) {
  const { contacts } = await api.listContacts();
  const exclude = new Set(excludeIds);
  const users = contacts.map((c) => c.user).filter((u) => u && !exclude.has(u.id)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const selected = new Map();
  const admins = new Set();
  let query = "";

  const chips = el("div", { class: "tw-selector-chips" });
  const search = el("input", {
    class: "tw-selector-input",
    placeholder: "Кого добавить?",
    oninput: (e) => {
      query = e.target.value.trim().toLowerCase();
      renderList();
    },
    onkeydown: (e) => {
      if (e.key === "Backspace" && !search.value && selected.size) {
        const last = [...selected.keys()].pop();
        toggle(last, false);
      }
    },
  });
  const selector = el("div", { class: "tw-selector", onclick: () => search.focus() }, [chips, search]);
  const list = el("div", { class: "tw-tab-list" });

  function toggle(id, on) {
    if (on) selected.set(id, users.find((u) => u.id === id));
    else {
      selected.delete(id);
      admins.delete(id);
    }
    renderChips();
    renderList();
  }

  function renderChips() {
    chips.replaceChildren(
      ...[...selected.values()].map((u) =>
        el("button", { type: "button", class: "tw-chip", onclick: (e) => { e.stopPropagation(); toggle(u.id, false); } }, [
          Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 32 }),
          el("span", { class: "tw-chip-name" }, u.name.split(" ")[0]),
          el("span", { class: "tw-chip-remove", html: iconSvg("X", 16) }),
        ])
      )
    );
    search.placeholder = selected.size ? "" : "Кого добавить?";
  }

  function renderList() {
    const shown = query ? users.filter((u) => `${u.name} ${u.username ?? ""}`.toLowerCase().includes(query)) : users;
    if (!users.length) {
      list.replaceChildren(el("p", { class: "tw-empty" }, "Список контактов пуст — сначала добавьте людей в контакты."));
      return;
    }
    if (!shown.length) {
      list.replaceChildren(el("p", { class: "tw-empty" }, "Никого не нашлось"));
      return;
    }
    list.replaceChildren(
      el("p", { class: "tw-section-name tw-list-caption" }, "Контакты"),
      ...shown.map((u) => {
        const checked = selected.has(u.id);
        const adminBtn =
          allowRoles && checked
            ? el("span", {
                class: `tw-admin-toggle${admins.has(u.id) ? " active" : ""}`,
                title: admins.has(u.id) ? "Администратор" : "Сделать администратором",
                html: iconSvg("Shield", 20),
                onclick: (e) => {
                  e.stopPropagation();
                  if (admins.has(u.id)) admins.delete(u.id);
                  else admins.add(u.id);
                  renderList();
                },
              })
            : null;
        return twUserCheckRow(u, {
          checked,
          subtitle: admins.has(u.id) ? "администратор" : u.username ? `@${u.username}` : u.lastSeen ? `был(а) ${timeAgo(u.lastSeen)}` : null,
          right: adminBtn,
          onToggle: (on) => toggle(u.id, on),
        });
      })
    );
  }

  renderChips();
  renderList();

  openSideTab({
    title,
    content: [
      selector,
      allowRoles ? el("p", { class: "tw-section-caption tw-picker-hint" }, "Нажмите на щит рядом с отмеченным человеком, чтобы сразу сделать его администратором.") : null,
      list,
    ],
    fab: {
      icon: fabIcon,
      title: submitLabel,
      onClick: (tab) => {
        if (!skippable && !selected.size) {
          search.focus();
          return;
        }
        if (allowRoles) onConfirm({ userIds: [...selected.keys()], adminIds: [...admins] }, tab);
        else onConfirm([...selected.keys()], tab);
        if (!tab.keepOpen) tab.close({ all: true });
      },
    },
  });
}
