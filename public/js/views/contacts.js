import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { getState, setState } from "../state.js";
import { openProfileDialog } from "../components/profileDialog.js";
import { statusLabel } from "../lib/presence.js";
import { openImportContactsDialog } from "../components/importContactsDialog.js";
import { PhoneField } from "../components/phoneField.js";

// Digits only, so "+7 999 123-45-67", "8 (999) 1234567" and "79991234567" are
// one number when filtering. Mirrors server/lib/phoneMatch.js's phoneKey.
function digits(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
}

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
  // "по номеру" first: it's how Telegram's own add-contact form works, and it's
  // the one people can actually use — a phone number you already have written
  // down, rather than a handle you'd have to be told.
  let addMode = "phone";
  let notRegistered = null; // { phone } — found nobody, offer an invite instead
  let inviteLink = null;
  let inviteCopied = false;

  api
    .getPremiumInfo()
    .then((info) => {
      if (info?.referralCode) inviteLink = `${window.location.origin}/login?ref=${info.referralCode}`;
    })
    .catch(() => {});

  // Filters the list you already have. Separate from the add form below, which
  // searches accounts you don't: mixing the two is how you end up "searching"
  // and getting nothing because the person isn't a contact yet.
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
      notRegistered = null;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(query), 400);
      renderCandidates();
    },
  });

  // The Telegram-shaped form: a name you choose and the number you have.
  const nameInput = el("input", { class: "login-input", placeholder: "Имя (как записать у себя)" });
  // Country picker in front of the number (components/phoneField.js) — the old
  // single box was formatted for a Russian number and capped at 11 digits, so a
  // foreign contact simply could not be typed in.
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

  // One number through the same endpoint the address-book import uses, so the
  // privacy rules ("кто может найти меня по номеру") are enforced in exactly one
  // place and a single lookup can't become a way around them. That endpoint
  // reports a hidden account as simply not registered — which is the point, and
  // why this screen can't tell the difference either.
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

  async function confirmAdd(u) {
    const localName = nameInput.value.trim();
    await api.addContact(u.id, localName || null);
    ({ contacts } = await api.listContacts());
    adding = false;
    query = "";
    searchResult = null;
    notRegistered = null;
    nameInput.value = "";
    render();
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
        el("button", { class: "contact-candidate-row", onclick: () => confirmAdd(u) }, [
          Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 32 }),
          el("span", { class: "contact-candidate-name" }, u.name),
          u.username ? el("span", { class: "contact-candidate-username" }, `@${u.username}`) : null,
        ].filter(Boolean))
      );
    }
    // Nobody on that number. Telegram offers an SMS invite here; there's no SMS
    // gateway in this app, so the invite is the referral link — which is also
    // worth more to both sides than a plain "join me" would be.
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
                inviteCopied = true; // sharing cancelled or clipboard blocked — the link is still on screen below
              }
              renderCandidates();
            },
          },
          "Пригласить в Shalter"
        ),
        // filter(Boolean): native Element.append() turns a null argument into a
        // literal "null" text node — it rendered as «Пригласить в Shalternull».
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
    setState({ user: { ...getState().user, blockedUserIds: [...blockedIds] } });
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

  // What this contact is called here: your own label if you set one, otherwise
  // the name on the account.
  const displayName = (c) => c.localName || c.user.name;

  function visibleContacts() {
    const q = filter.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) => displayName(a).localeCompare(displayName(b), "ru"));
    if (!q) return sorted;
    // Digits in the query mean "looking for a number" — matched against the
    // number with its own formatting stripped, so how either side wrote the
    // spaces and dashes doesn't matter.
    const qDigits = digits(q);
    return sorted.filter(
      (c) =>
        displayName(c).toLowerCase().includes(q) ||
        c.user.name.toLowerCase().includes(q) ||
        (c.user.username ?? "").toLowerCase().includes(q.replace(/^@/, "")) ||
        (qDigits.length >= 3 && digits(c.user.phone).includes(qDigits))
    );
  }

  const listEl = el("div", { class: "contacts-list" });

  // Перерисовка не должна выбивать курсор из поля.
  //
  // Поля здесь создаются один раз и переиспользуются, но mount() всё равно
  // вынимает их из документа и вставляет обратно — а для браузера «вынули» это
  // «потеряли фокус», даже если вставили тот же самый узел. Отсюда и «по одному
  // символу»: после каждой буквы приходилось снова тыкать в поле. Запоминаем
  // фокус и позицию курсора и возвращаем их после сборки.
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
        // У input[type=search] и подобных выделение может быть недоступно —
        // сам фокус важнее позиции курсора.
      }
    }
  }

  function render() {

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

  // Its own render so typing in the filter doesn't rebuild (and unfocus) the
  // field doing the typing — the same trap the add form fell into once already.
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
    listEl.append(
      ...sorted.map((c) => {
        const user = c.user;
        return el("div", { class: "contact-row" }, [
          el("button", { class: "contact-row-profile-btn", onclick: () => openProfileDialog(user.id) }, [
            Avatar({ name: displayName(c), color: user.avatarColor, image: user.avatarImage, online: user.online }),
            el("div", { class: "contact-row-body" }, [
              el("p", { class: "contact-row-name" }, [displayName(c), VerifiedBadge(user, 13)].filter(Boolean)),
              el(
                "p",
                { class: `contact-row-status ${user.online ? "online" : ""}` },
                // When you've given them your own name, the account's own name
                // is the useful second line — otherwise you'd lose track of who
                // "Мама" actually is on the service.
                c.localName && c.localName !== user.name
                  ? user.name
                  : statusLabel(user) ?? (user.username ? `@${user.username}` : "недавно")
              ),
            ]),
          ]),
          el("button", {
            class: "icon-btn",
            title: "Переименовать у себя",
            html: iconSvg("Edit", 15),
            onclick: async () => {
              const next = prompt(`Как записать ${user.name}?`, c.localName ?? user.name);
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
              render();
            },
          }),
        ]);
      })
    );

  }

  render();
}
