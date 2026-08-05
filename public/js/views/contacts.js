import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { statusLabel } from "../lib/presence.js";

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

  async function runSearch(q) {
    searchResult = null;
    searchError = null;
    const trimmed = q.trim().replace(/^@/, "");
    if (trimmed.length < 5) {
      render();
      return;
    }
    searching = true;
    render();
    try {
      const { user } = await api.findUserByUsername(trimmed);
      if (contacts.some((c) => c.userId === user.id)) searchError = "Уже в контактах";
      else searchResult = user;
    } catch {
      searchError = "Пользователь не найден";
    } finally {
      searching = false;
      render();
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
      el(
        "button",
        { class: "btn-accent-pill", onclick: () => { adding = !adding; searchResult = null; searchError = null; query = ""; render(); } },
        [el("span", { html: iconSvg("Plus", 15) }), " Добавить"]
      ),
    ]);

    const addPanel = adding
      ? el("div", { class: "contacts-add-panel" }, [
          el("p", { class: "settings-toggle-hint" }, "Введите точный @юзернейм — по имени искать нельзя, чтобы случайно не добавить незнакомца."),
          el("input", {
            class: "login-input",
            autofocus: true,
            placeholder: "@юзернейм",
            value: query,
            oninput: (e) => {
              query = e.target.value;
              searchResult = null;
              searchError = null;
              clearTimeout(searchTimer);
              searchTimer = setTimeout(() => runSearch(query), 400);
              render();
            },
          }),
          el(
            "div",
            { class: "contacts-candidates" },
            [
              searching ? el("p", { class: "empty-hint" }, "Ищем…") : null,
              searchError ? el("p", { class: "empty-hint" }, searchError) : null,
              searchResult
                ? el(
                    "button",
                    {
                      class: "contact-candidate-row",
                      onclick: async () => {
                        const u = searchResult;
                        await api.addContact(u.id);
                        contacts = [...contacts, { id: `ct_${u.id}`, userId: u.id, addedAt: new Date().toISOString(), user: u }];
                        adding = false;
                        query = "";
                        searchResult = null;
                        render();
                      },
                    },
                    [
                      Avatar({ name: searchResult.name, color: searchResult.avatarColor, image: searchResult.avatarImage, size: 32 }),
                      el("span", { class: "contact-candidate-name" }, searchResult.name),
                      el("span", { class: "contact-candidate-username" }, `@${searchResult.username}`),
                    ]
                  )
                : null,
            ].filter(Boolean)
          ),
        ])
      : null;

    const list = el(
      "div",
      { class: "contacts-list" },
      sorted.length === 0
        ? el("p", { class: "empty-hint" }, "Список контактов пуст")
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
