import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { statusLabel } from "../lib/presence.js";
import { openImportContactsDialog } from "../components/importContactsDialog.js";

export async function ContactsView(root) {
  const { contacts: initialContacts } = await api.listContacts();
  let contacts = initialContacts;
  let adding = false;
  let query = "";
  // Explicit exact-username lookup only (see server/routes/users.js's
  // /by-username/:username) — no more browsing/filtering a dump of every
  // registered user, which made it trivially easy to "just add" someone you
  // barely know. Matches Telegram's own "add by username" flow: you type
  // the handle you already know, not scroll a directory of strangers.
  let searchResult = null;
  let searchError = null;
  let searching = false;
  let searchTimer = null;
  let blockedIds = new Set(getState().user.blockedUserIds ?? []);

  // Built once and reused by every render() below, never rebuilt from the
  // current `query` — a fresh <input> node on each keystroke is exactly what
  // broke this: render() runs on every oninput, mount() swapped in a brand
  // new input, and the old one (the focused one) was discarded mid-typing, so
  // the field went dead after the first character.
  const searchInput = el("input", {
    class: "login-input",
    placeholder: "@юзернейм",
    oninput: (e) => {
      query = e.target.value;
      searchResult = null;
      searchError = null;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(query), 400);
      renderCandidates();
    },
  });
  const candidatesEl = el("div", { class: "contacts-candidates" });

  async function runSearch(q) {
    searchResult = null;
    searchError = null;
    const trimmed = q.trim().replace(/^@/, "");
    if (trimmed.length < 5) {
      renderCandidates();
      return;
    }
    searching = true;
    renderCandidates();
    try {
      const { user } = await api.findUserByUsername(trimmed);
      // A stale response from a previous, longer/shorter query that resolved
      // after the user kept typing must not overwrite the current one.
      if (query.trim().replace(/^@/, "") !== trimmed) return;
      if (contacts.some((c) => c.userId === user.id)) searchError = "Уже в контактах";
      else searchResult = user;
    } catch {
      if (query.trim().replace(/^@/, "") !== trimmed) return;
      searchError = "Пользователь не найден";
    } finally {
      searching = false;
      renderCandidates();
    }
  }

  // Only the result slot under the input — the input itself stays mounted and
  // focused, so typing is never interrupted.
  function renderCandidates() {
    clear(candidatesEl);
    if (searching) candidatesEl.appendChild(el("p", { class: "empty-hint" }, "Ищем…"));
    if (searchError) candidatesEl.appendChild(el("p", { class: "empty-hint" }, searchError));
    if (searchResult) {
      const u = searchResult;
      candidatesEl.appendChild(
        el(
          "button",
          {
            class: "contact-candidate-row",
            onclick: async () => {
              await api.addContact(u.id);
              contacts = [...contacts, { id: `ct_${u.id}`, userId: u.id, addedAt: new Date().toISOString(), user: u }];
              adding = false;
              query = "";
              searchResult = null;
              render();
            },
          },
          [
            Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 32 }),
            el("span", { class: "contact-candidate-name" }, u.name),
            el("span", { class: "contact-candidate-username" }, `@${u.username}`),
          ]
        )
      );
    }
  }

  async function toggleBlocked(userId) {
    const nextBlocked = !blockedIds.has(userId);
    await api.setBlocked(userId, nextBlocked);
    if (nextBlocked) blockedIds.add(userId);
    else blockedIds.delete(userId);
    setState({ user: { ...getState().user, blockedUserIds: [...blockedIds] } });
    render();
  }

  function render() {
    const sorted = [...contacts].sort((a, b) => a.user.name.localeCompare(b.user.name, "ru"));

    const header = el("header", { class: "contacts-header" }, [
      el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
      el("p", { class: "view-title" }, "Контакты"),
      el("button", {
        class: "icon-btn",
        title: "Найти друзей из контактов телефона",
        html: iconSvg("Users", 18),
        onclick: () => openImportContactsDialog(async () => {
            // A contact added from the dialog should show up behind it right
            // away, not on the next visit to this screen.
            ({ contacts } = await api.listContacts());
            render();
          }),
      }),
      el(
        "button",
        {
          class: "btn-accent-pill",
          onclick: () => {
            adding = !adding;
            searchResult = null;
            searchError = null;
            query = "";
            render();
            // Explicit, not the `autofocus` attribute this used to carry —
            // autofocus only applies to an element present at parse time, so
            // it never fired for a panel mounted later by render().
            if (adding) searchInput.focus();
          },
        },
        [el("span", { html: iconSvg("Plus", 15) }), " Добавить"]
      ),
    ]);

    if (adding) {
      searchInput.value = query;
      renderCandidates();
    }
    const addPanel = adding
      ? el("div", { class: "contacts-add-panel" }, [
          el("p", { class: "settings-toggle-hint" }, "Введите точный @юзернейм — по имени искать нельзя, чтобы случайно не добавить незнакомца. Знакомых проще найти через контакты телефона — кнопка со значком людей вверху."),
          searchInput,
          candidatesEl,
        ])
      : null;

    const list = el(
      "div",
      { class: "contacts-list" },
      sorted.length === 0
        ? el("div", { class: "contacts-empty" }, [
            el("p", { class: "empty-hint" }, "Список контактов пуст"),
            el("button", { class: "btn-accent", onclick: () => openImportContactsDialog(async () => {
            // A contact added from the dialog should show up behind it right
            // away, not on the next visit to this screen.
            ({ contacts } = await api.listContacts());
            render();
          }) }, "Найти друзей из контактов"),
          ])
        : sorted.map(({ user }) =>
            el("div", { class: "contact-row" }, [
              el("button", { class: "contact-row-profile-btn", onclick: () => openProfileDialog(user.id) }, [
                Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, online: user.online }),
                el("div", { class: "contact-row-body" }, [
                  el("p", { class: "contact-row-name" }, user.name),
                  el(
                    "p",
                    { class: `contact-row-status ${user.online ? "online" : ""}` },
                    statusLabel(user) ?? (user.username ? `@${user.username}` : "недавно")
                  ),
                ]),
              ]),
              el("button", {
                class: "icon-btn",
                title: "Написать",
                html: iconSvg("Send", 16),
                onclick: async () => {
                  const { chat } = await api.startDm(user.id, user.name, user.avatarColor);
                  navigate(`/chat/${chat.id}`);
                },
              }),
              el("button", {
                class: `icon-btn ${blockedIds.has(user.id) ? "blocked-icon" : ""}`,
                title: blockedIds.has(user.id) ? "Разблокировать" : "Заблокировать",
                html: iconSvg("Lock", 16),
                onclick: () => toggleBlocked(user.id),
              }),
              el("button", {
                class: "icon-btn",
                title: "Удалить из контактов",
                html: iconSvg("Trash", 16),
                onclick: async () => {
                  await api.removeContact(user.id);
                  contacts = contacts.filter((c) => c.userId !== user.id);
                  render();
                },
              }),
            ])
          )
    );

    mount(root, el("div", { class: "contacts-view" }, [header, addPanel, list]));
  }

  render();
}
