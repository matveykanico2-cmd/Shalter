import { askText } from "../components/confirmDialog.js";
import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { ProfileStatusBadge } from "../components/profileStatusBadge.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState, updateSelf } from "../state.js";
import { openProfileDialog, isBirthdayToday } from "../components/profileDialog.js";
import { statusLabel } from "../lib/presence.js";
import { openImportContactsDialog } from "../components/importContactsDialog.js";
import { PhoneField } from "../components/phoneField.js";

function digits(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
}

export async function ContactsView(root) {
  const { contacts: initialContacts } = await api.listContacts();
  let contacts = initialContacts;
  let adding = false;
  let query = "";
  let searchResult = null;
  let searchError = null;
  let searching = false;
  let searchTimer = null;
  let blockedIds = new Set(getState().user.blockedUserIds ?? []);
  let addMode = "phone";
  let notRegistered = null;
  const inviteLink = `${window.location.origin}/login`;
  let inviteCopied = false;

  let filter = "";
  const filterInput = el("input", {
    class: "login-input contacts-filter",
    type: "search",
    placeholder: "Поиск по имени или номеру",
    oninput: (e) => {
      filter = e.target.value;
      renderList();
    },
  });

  const searchInput = el("input", {
    class: "login-input",
    placeholder: "@юзернейм",
    oninput: (e) => {
      query = e.target.value;
      searchResult = null;
      searchError = null;
      notRegistered = null;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(query), 400);
      renderCandidates();
    },
  });

  const NAME_DRAFT_KEY = "contact-add-name-draft";
  const nameInput = el("input", { class: "login-input", placeholder: "Имя (как записать у себя)" });
  try {
    nameInput.value = sessionStorage.getItem(NAME_DRAFT_KEY) || "";
  } catch {
  }
  nameInput.addEventListener("input", () => {
    try {
      sessionStorage.setItem(NAME_DRAFT_KEY, nameInput.value);
    } catch {
    }
  });
  const phoneField = PhoneField({
    onChange: () => {
      searchResult = null;
      searchError = null;
      notRegistered = null;
      renderCandidates();
    },
  });
  phoneField.el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("phone-number-input")) lookUpPhone();
  });
  const candidatesEl = el("div", { class: "contacts-candidates" });

  async function lookUpPhone() {
    const phone = phoneField.value();
    searchResult = null;
    searchError = null;
    notRegistered = null;
    if (digits(phone).length < 10) {
      searchError = "Введите номер полностью";
      renderCandidates();
      return;
    }
    searching = true;
    renderCandidates();
    try {
      const { found, notFound } = await api.matchContacts([{ phone, name: nameInput.value.trim() }]);
      if (found.length) {
        const entry = found[0];
        if (entry.alreadyContact) searchError = "Уже в контактах";
        else searchResult = entry.user;
      } else {
        notRegistered = { phone: notFound[0]?.phone ?? phone };
      }
    } catch (err) {
      searchError = err.message || "Не удалось проверить номер";
    } finally {
      searching = false;
      renderCandidates();
    }
  }

  async function runSearch(q) {
    searchResult = null;
    searchError = null;
    const trimmed = q.trim().replace(/^@/, "");
    if (trimmed.length < 3) {
      renderCandidates();
      return;
    }
    searching = true;
    renderCandidates();
    try {
      const { user } = await api.findUserByUsername(trimmed);
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

  async function confirmAdd(u) {
    const localName = nameInput.value.trim();
    await api.addContact(u.id, localName || null);
    ({ contacts } = await api.listContacts());
    syncContactIds();
    adding = false;
    query = "";
    searchResult = null;
    notRegistered = null;
    nameInput.value = "";
    try {
      sessionStorage.removeItem(NAME_DRAFT_KEY);
    } catch {
    }
    render();
  }

  function syncContactIds() {
    setState({ contactIds: contacts.map((c) => c.userId) });
  }

  function renderCandidates() {
    clear(candidatesEl);
    if (searching) candidatesEl.appendChild(el("p", { class: "empty-hint" }, "Ищем…"));
    if (searchError) candidatesEl.appendChild(el("p", { class: "empty-hint" }, searchError));
    if (searchResult) {
      const u = searchResult;
      candidatesEl.appendChild(
        el("button", { class: "contact-candidate-row", onclick: () => confirmAdd(u) }, [
          Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 32 }),
          el("span", { class: "contact-candidate-name" }, u.name),
          u.username ? el("span", { class: "contact-candidate-username" }, `@${u.username}`) : null,
        ].filter(Boolean))
      );
    }
    if (notRegistered) {
      candidatesEl.append(
        el("p", { class: "empty-hint" }, `На номере ${notRegistered.phone} никого нет в Shalter`),
        el(
          "button",
          {
            class: "btn-accent",
            onclick: async () => {
              const text = `Привет! Пишу тебе из Shalter — попробуй, там удобно.${inviteLink ? ` ${inviteLink}` : ""}`;
              try {
                if (navigator.share) await navigator.share({ text });
                else await navigator.clipboard.writeText(text);
                inviteCopied = true;
              } catch {
                inviteCopied = true;
              }
              renderCandidates();
            },
          },
          "Пригласить в Shalter"
        ),
        ...(inviteCopied
          ? [el("p", { class: "settings-toggle-hint" }, `Приглашение скопировано${inviteLink ? `: ${inviteLink}` : ""}`)]
          : [])
      );
    }
  }

  async function toggleBlocked(userId) {
    const nextBlocked = !blockedIds.has(userId);
    await api.setBlocked(userId, nextBlocked);
    if (nextBlocked) blockedIds.add(userId);
    else blockedIds.delete(userId);
    updateSelf({ blockedUserIds: [...blockedIds] });
    render();
  }

  function setMode(mode) {
    addMode = mode;
    searchResult = null;
    searchError = null;
    notRegistered = null;
    render();
    (mode === "phone" ? nameInput : searchInput).focus();
  }

  const displayName = (c) => c.localName || c.user.name;

  // Сортировка как в Telegram: по умолчанию сначала те, кто в сети, затем по
  // времени последнего визита; можно переключить на «по имени».
  let sortMode = "seen";
  try {
    sortMode = localStorage.getItem("shalter_contacts_sort") === "name" ? "name" : "seen";
  } catch {
  }
  function setSortMode(mode) {
    sortMode = mode;
    try {
      localStorage.setItem("shalter_contacts_sort", mode);
    } catch {
    }
    render();
  }
  const seenRank = (u) => (u.online ? "9" : u.lastSeen ? `1${u.lastSeen}` : "0");
  function compareContacts(a, b) {
    if (sortMode === "seen") {
      const diff = seenRank(b.user).localeCompare(seenRank(a.user));
      if (diff) return diff;
    }
    return displayName(a).localeCompare(displayName(b), "ru");
  }

  function visibleContacts() {
    const q = filter.trim().toLowerCase();
    const sorted = [...contacts].sort(compareContacts);
    if (!q) return sorted;
    const qDigits = digits(q);
    return sorted.filter(
      (c) =>
        displayName(c).toLowerCase().includes(q) ||
        c.user.name.toLowerCase().includes(q) ||
        (c.user.profileName ?? "").toLowerCase().includes(q) ||
        (c.user.username ?? "").toLowerCase().includes(q.replace(/^@/, "")) ||
        (qDigits.length >= 3 && digits(c.user.phone).includes(qDigits))
    );
  }

  const listEl = el("div", { class: "contacts-list" });

  function withKeptFocus(draw) {
    const active = document.activeElement;
    const canSelect = active && typeof active.selectionStart === "number";
    const start = canSelect ? active.selectionStart : null;
    const end = canSelect ? active.selectionEnd : null;
    draw();
    if (!active || !active.isConnected || active === document.body) return;
    active.focus();
    if (start != null) {
      try {
        active.setSelectionRange(start, end);
      } catch {
      }
    }
  }

  function render() {

    const header = el("header", { class: "contacts-header" }, [
      el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
      el("p", { class: "view-title" }, "Контакты"),
      el("button", {
        class: "icon-btn",
        title: "Люди рядом",
        html: iconSvg("MapPin", 18),
        onclick: () => navigate("/nearby"),
      }),
      el("button", {
        class: "icon-btn",
        title: "Найти друзей из контактов телефона",
        html: iconSvg("Users", 18),
        onclick: () => openImportContactsDialog(async () => {
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
    const modeSwitch = el("div", { class: "contacts-add-modes" }, [
      el("button", { class: `contacts-add-mode ${addMode === "phone" ? "active" : ""}`, onclick: () => setMode("phone") }, "По номеру"),
      el("button", { class: `contacts-add-mode ${addMode === "username" ? "active" : ""}`, onclick: () => setMode("username") }, "По юзернейму"),
    ]);
    const addPanel = adding
      ? el("div", { class: "contacts-add-panel" }, [
          modeSwitch,
          ...(addMode === "phone"
            ? [
                el("p", { class: "settings-toggle-hint" }, "Как в телефонной книге: имя, под которым записать, и номер. Имя видите только вы."),
                nameInput,
                el("div", { class: "contacts-phone-row" }, [
                  phoneField.el,
                  el("button", { class: "btn-accent-pill", onclick: lookUpPhone }, "Найти"),
                ]),
              ]
            : [
                el("p", { class: "settings-toggle-hint" }, "Введите точный @юзернейм — по имени искать нельзя, чтобы случайно не добавить незнакомца."),
                searchInput,
              ]),
          candidatesEl,
        ])
      : null;

    renderList();
    withKeptFocus(() => mount(root, el("div", { class: "contacts-view" }, [header, addPanel, contacts.length ? filterInput : null, listEl].filter(Boolean))));
  }

  function renderList() {
    const sorted = visibleContacts();
    clear(listEl);
    if (contacts.length === 0) {
      listEl.append(
        el("div", { class: "contacts-empty" }, [
          el("p", { class: "empty-hint" }, "Список контактов пуст"),
          el(
            "button",
            {
              class: "btn-accent",
              onclick: () =>
                openImportContactsDialog(async () => {
                  ({ contacts } = await api.listContacts());
                  render();
                }),
            },
            "Найти друзей из контактов"
          ),
        ])
      );
      return;
    }
    if (sorted.length === 0) {
      listEl.appendChild(el("p", { class: "empty-hint" }, `По запросу «${filter.trim()}» никого нет`));
      return;
    }
    // Дни рождения сегодня — отдельным блоком сверху, как в Telegram.
    const birthdays = filter.trim() ? [] : sorted.filter((c) => c.user.birthday && isBirthdayToday(c.user.birthday));
    if (birthdays.length) {
      listEl.appendChild(el("p", { class: "list-section-label" }, "🎂 Сегодня день рождения"));
      listEl.append(
        ...birthdays.map((c) =>
          el("div", { class: "contact-row contact-birthday-row" }, [
            el("button", { class: "contact-row-profile-btn", onclick: () => openProfileDialog(c.user.id) }, [
              Avatar({ name: displayName(c), color: c.user.avatarColor, image: c.user.avatarImage, online: c.user.online, size: 54 }),
              el("div", { class: "contact-row-body" }, [el("p", { class: "contact-row-name" }, displayName(c)), el("p", { class: "contact-row-status" }, "Поздравьте!")]),
            ]),
            el("button", {
              class: "btn-accent-pill",
              onclick: async () => {
                const { chat } = await api.startDm(c.user.id, c.user.name, c.user.avatarColor);
                navigate(`/chat/${chat.id}`);
              },
            }, "Написать"),
          ])
        )
      );
    }
    listEl.appendChild(
      el("div", { class: "contacts-list-head" }, [
        el("p", { class: "list-section-label" }, filter.trim() ? `Найдено — ${sorted.length}` : `Контакты — ${sorted.length}`),
        el(
          "button",
          { class: "contacts-sort-btn", title: "Сортировка", onclick: () => setSortMode(sortMode === "seen" ? "name" : "seen") },
          sortMode === "seen" ? "по времени входа" : "по имени"
        ),
      ])
    );
    listEl.append(
      ...sorted.map((c) => {
        const user = c.user;
        return el("div", { class: "contact-row" }, [
          el("button", { class: "contact-row-profile-btn", onclick: () => openProfileDialog(user.id) }, [
            Avatar({ name: displayName(c), color: user.avatarColor, image: user.avatarImage, online: user.online, size: 54 }),
            el("div", { class: "contact-row-body" }, [
              el("p", { class: "contact-row-name" }, [
                // Имя — отдельным элементом: голый текст во flex-строке не сжимается
                // с многоточием и выталкивает значок взаимного контакта за край.
                el("span", { class: "contact-row-name-text" }, displayName(c)),
                user.mutualContact ? el("span", { class: "mutual-contact-mark", title: "Взаимный контакт — вы есть друг у друга в контактах" }, "⇄") : null,
                VerifiedBadge(user, 13),
                ProfileStatusBadge(user, 13),
              ].filter(Boolean)),
              el(
                "p",
                { class: `contact-row-status ${user.online ? "online" : ""}` },
                statusLabel(user) ?? (user.username ? `@${user.username}` : "был(а) недавно")
              ),
            ]),
          ]),
          el("button", {
            class: "icon-btn",
            title: "Переименовать у себя",
            html: iconSvg("Edit", 15),
            onclick: async () => {
              const next = (await askText(`Как записать ${user.name}?`, c.localName ?? user.name));
              if (next == null) return;
              await api.renameContact(user.id, next.trim());
              ({ contacts } = await api.listContacts());
              renderList();
            },
          }),
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
              contacts = contacts.filter((x) => x.userId !== user.id);
              syncContactIds();
              render();
            },
          }),
        ]);
      })
    );

  }

  render();
}
