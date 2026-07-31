import { el, mount, clear } from "../../lib/dom.js";
import { iconSvg } from "../../icons.js";
import { Avatar } from "../../components/avatar.js";
import { api } from "../../api.js";
import { getState, setState } from "../../state.js";
import { navigate } from "../../router.js";
import { fileToAvatarDataUrl } from "../../lib/image.js";
import { requestPushPermission } from "../../lib/push.js";

const SECTIONS = [
  { id: "", label: "Профиль" },
  { id: "appearance", label: "Внешний вид" },
  { id: "notifications", label: "Уведомления" },
  { id: "privacy", label: "Конфиденциальность" },
  { id: "devices", label: "Устройства" },
  { id: "accounts", label: "Аккаунты" },
  { id: "folders", label: "Папки" },
  { id: "data", label: "Данные и память" },
];

function Toggle(checked, onChange) {
  return el("button", { class: `settings-toggle ${checked ? "on" : ""}`, onclick: () => onChange(!checked) }, [
    el("span", { class: "settings-toggle-knob" }),
  ]);
}

export async function SettingsView(root, page) {
  const section = page ?? "";
  const shell = el("div", { class: "settings-view" });
  const nav = el("div", { class: "settings-nav" }, [
    el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
    ...SECTIONS.map((s) =>
      el(
        "a",
        {
          href: `/settings${s.id ? "/" + s.id : ""}`,
          "data-route": "1",
          class: `settings-nav-item ${section === s.id ? "active" : ""}`,
        },
        s.label
      )
    ),
  ]);
  const contentSlot = el("div", { class: "settings-content" });
  shell.append(nav, contentSlot);
  mount(root, shell);

  const renderers = {
    "": renderProfile,
    appearance: renderAppearance,
    notifications: renderNotifications,
    privacy: renderPrivacy,
    devices: renderDevices,
    accounts: renderAccounts,
    folders: renderFolders,
    data: renderData,
  };
  await (renderers[section] ?? renderProfile)(contentSlot);
}

function pageWrap(title, subtitle, children) {
  return el("div", { class: "settings-page" }, [
    el("p", { class: "settings-page-title" }, title),
    subtitle ? el("p", { class: "settings-page-subtitle" }, subtitle) : null,
    ...children,
  ]);
}

async function renderProfile(root) {
  const me = getState().user;
  let name = me.name;
  let username = me.username;
  let bio = me.bio;
  let avatarImage = me.avatarImage;
  let saved = false;

  function render() {
    const fileInput = el("input", {
      type: "file",
      accept: "image/*",
      class: "hidden-input",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          avatarImage = await fileToAvatarDataUrl(file);
          await api.updateProfile(me.id, { avatarImage });
          setState({ user: { ...getState().user, avatarImage } });
          render();
        } catch {
          alert("Не удалось загрузить фото");
        }
      },
    });
    const avatarBtn = el("button", { class: "settings-avatar-btn", onclick: () => fileInput.click() }, [
      Avatar({ name: name || "?", color: me.avatarColor, image: avatarImage, size: 72 }),
      el("span", { class: "settings-avatar-edit", html: iconSvg("Edit", 12) }),
    ]);

    mount(
      root,
      pageWrap("", null, [
        el("div", { class: "settings-profile-header" }, [
          avatarBtn,
          fileInput,
          el("div", {}, [
            el("p", { class: "settings-profile-name" }, name || "Без имени"),
            el("p", { class: "mono settings-profile-sub" }, me.phone || me.email),
          ]),
        ]),
        el("label", { class: "settings-field" }, [
          el("span", { class: "settings-field-label" }, "Имя"),
          el("input", { class: "settings-input", value: name, oninput: (e) => (name = e.target.value) }),
        ]),
        el("label", { class: "settings-field" }, [
          el("span", { class: "settings-field-label" }, "Юзернейм"),
          el("input", { class: "settings-input", value: username, oninput: (e) => (username = e.target.value) }),
        ]),
        el("label", { class: "settings-field" }, [
          el("span", { class: "settings-field-label" }, "О себе"),
          el("textarea", { class: "settings-input", rows: 3, value: bio, oninput: (e) => (bio = e.target.value) }),
        ]),
        el(
          "button",
          {
            class: "btn-accent",
            onclick: async () => {
              await api.updateProfile(me.id, { name, username, bio });
              setState({ user: { ...getState().user, name, username, bio } });
              saved = true;
              render();
              setTimeout(() => {
                saved = false;
                render();
              }, 1500);
            },
          },
          saved ? "Сохранено ✓" : "Сохранить"
        ),
      ])
    );
  }
  render();
}

async function renderAppearance(root) {
  const { settings: initial } = await api.getSettings();
  let settings = initial;
  const THEMES = [
    { id: "light", label: "Светлая" },
    { id: "dark", label: "Тёмная" },
    { id: "system", label: "Системная" },
  ];
  const ACCENTS = ["#2E56D9", "#C6403B", "#1F9D63", "#B9791C", "#6E56C6", "#1C9BD9", "#D9822E"];
  const WALLPAPERS = [
    { id: "default", label: "По умолчанию" },
    { id: "dots", label: "Точки" },
    { id: "gradient", label: "Градиент" },
  ];

  function applyTheme(theme) {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }
  function applyAccent(hex) {
    document.documentElement.style.setProperty("--color-accent", hex);
  }
  applyAccent(settings.accent);

  async function patch(p) {
    settings = { ...settings, ...p };
    if (p.theme) applyTheme(p.theme);
    if (p.accent) applyAccent(p.accent);
    render();
    await api.patchSettings(p);
  }

  function render() {
    mount(
      root,
      pageWrap("Внешний вид", "Тема, акцентный цвет и фон переписки", [
        el("p", { class: "settings-field-label" }, "Тема"),
        el(
          "div",
          { class: "settings-chip-row" },
          THEMES.map((t) =>
            el(
              "button",
              { class: `settings-chip ${settings.theme === t.id ? "active" : ""}`, onclick: () => patch({ theme: t.id }) },
              t.label
            )
          )
        ),
        el("p", { class: "settings-field-label" }, "Акцентный цвет"),
        el(
          "div",
          { class: "settings-swatch-row" },
          ACCENTS.map((hex) =>
            el("button", {
              class: `settings-swatch ${settings.accent === hex ? "active" : ""}`,
              style: { background: hex },
              onclick: () => patch({ accent: hex }),
            })
          )
        ),
        el("p", { class: "settings-field-label" }, `Размер шрифта сообщений — ${settings.fontSize}px`),
        el("input", {
          type: "range",
          min: 13,
          max: 19,
          value: settings.fontSize,
          class: "settings-range",
          oninput: (e) => patch({ fontSize: Number(e.target.value) }),
        }),
        el("p", { class: "settings-field-label" }, "Фон чата"),
        el(
          "div",
          { class: "settings-chip-row" },
          WALLPAPERS.map((w) =>
            el(
              "button",
              { class: `settings-chip ${settings.chatWallpaper === w.id ? "active" : ""}`, onclick: () => patch({ chatWallpaper: w.id }) },
              w.label
            )
          )
        ),
      ])
    );
  }
  render();
}

async function renderNotifications(root) {
  const { settings: initial } = await api.getSettings();
  let settings = initial;

  async function patch(notifications) {
    settings = { ...settings, notifications: { ...settings.notifications, ...notifications } };
    render();
    await api.patchSettings({ notifications: settings.notifications });
  }

  function permLabel() {
    if (typeof Notification === "undefined") return "не поддерживаются";
    return { granted: "разрешены", denied: "запрещены", default: "не запрошены" }[Notification.permission];
  }

  function render() {
    const canRequest = typeof Notification !== "undefined" && Notification.permission === "default";
    mount(
      root,
      pageWrap("Уведомления", "Как мессенджер сообщает о новых событиях", [
        el("div", { class: "settings-toggle-row" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, "Показывать текст в превью"),
            el("p", { class: "settings-toggle-hint" }, "Иначе — «Новое сообщение» без содержимого"),
          ]),
          Toggle(settings.notifications.previewText, (v) => patch({ previewText: v })),
        ]),
        el("div", { class: "settings-toggle-row" }, [
          el("span", { class: "settings-toggle-title" }, "Звук"),
          Toggle(settings.notifications.sound, (v) => patch({ sound: v })),
        ]),
        el("div", { class: "settings-notice-box" }, [
          el("p", { class: "settings-toggle-title" }, "Уведомления браузера"),
          el("p", { class: "settings-toggle-hint" }, `Статус: ${permLabel()}`),
          canRequest
            ? el("button", { class: "btn-accent", onclick: async () => { await requestPushPermission(); render(); } }, "Разрешить уведомления")
            : null,
        ]),
      ])
    );
  }
  render();
}

async function renderPrivacy(root) {
  const { settings: initial } = await api.getSettings();
  const { users: allUsers } = await api.listUsers();
  let settings = initial;
  let blockedIds = new Set(getState().user.blockedUserIds ?? []);
  const OPTIONS = [
    { value: "everyone", label: "Все" },
    { value: "contacts", label: "Мои контакты" },
    { value: "nobody", label: "Никто" },
  ];

  async function patch(privacy) {
    settings = { ...settings, privacy: { ...settings.privacy, ...privacy } };
    render();
    await api.patchSettings({ privacy: settings.privacy });
  }

  async function unblock(userId) {
    await api.setBlocked(userId, false);
    blockedIds.delete(userId);
    setState({ user: { ...getState().user, blockedUserIds: [...blockedIds] } });
    render();
  }

  function row(label, key) {
    return el("div", { class: "settings-toggle-row" }, [
      el("span", { class: "settings-toggle-title" }, label),
      el(
        "select",
        { class: "settings-select", onchange: (e) => patch({ [key]: e.target.value }) },
        OPTIONS.map((o) => el("option", { value: o.value, selected: settings.privacy[key] === o.value }, o.label))
      ),
    ]);
  }

  function render() {
    const blockedUsers = allUsers.filter((u) => blockedIds.has(u.id));
    mount(
      root,
      pageWrap("Конфиденциальность", "Кто видит вашу информацию", [
        row("Последний визит", "lastSeen"),
        row("Номер телефона", "phone"),
        row("Фото профиля", "photo"),
        el("p", { class: "settings-field-label" }, `Заблокированные пользователи (${blockedUsers.length})`),
        blockedUsers.length === 0
          ? el("p", { class: "empty-hint" }, "Никого не заблокировано")
          : el(
              "div",
              { class: "settings-devices-list" },
              blockedUsers.map((u) =>
                el("div", { class: "settings-device-row" }, [
                  Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 28 }),
                  el("div", { class: "settings-device-body" }, [el("p", {}, u.name)]),
                  el("button", { class: "settings-danger-link", onclick: () => unblock(u.id) }, "Разблокировать"),
                ])
              )
            ),
      ])
    );
  }
  render();
}

async function renderDevices(root) {
  const { sessions: initial } = await api.listSessions();
  let sessions = initial;

  function timeLabel(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }

  async function terminate(id) {
    sessions = sessions.filter((s) => s.id !== id);
    render();
    await api.removeSession(id);
  }

  function render() {
    const current = sessions.find((s) => s.current);
    const others = sessions.filter((s) => !s.current);
    mount(
      root,
      pageWrap("Устройства", "Активные сеансы вашего аккаунта", [
        current
          ? el("div", { class: "settings-current-device" }, [
              el("p", { class: "settings-toggle-title" }, "Это устройство"),
              el("p", {}, current.device),
              el("p", { class: "mono settings-toggle-hint" }, `${current.location} · ${timeLabel(current.lastActive)}`),
            ])
          : null,
        others.length
          ? el("div", { class: "settings-devices-list" }, [
              el("div", { class: "settings-devices-list-header" }, [
                el("p", { class: "settings-field-label" }, "Другие сеансы"),
                el("button", { class: "settings-danger-link", onclick: () => others.forEach((s) => terminate(s.id)) }, "Завершить все"),
              ]),
              ...others.map((s) =>
                el("div", { class: "settings-device-row" }, [
                  el("span", { html: iconSvg("Phone", 16) }),
                  el("div", { class: "settings-device-body" }, [el("p", {}, s.device), el("p", { class: "mono settings-toggle-hint" }, `${s.location} · ${timeLabel(s.lastActive)}`)]),
                  el("button", { class: "icon-btn", html: iconSvg("X", 15), onclick: () => terminate(s.id) }),
                ])
              ),
            ])
          : null,
      ])
    );
  }
  render();
}

async function renderAccounts(root) {
  const me = getState().user;
  const accounts = getState().accounts;

  async function switchTo(uid) {
    if (uid === me.id) return;
    await api.switchAccount(uid);
    window.location.href = "/";
  }
  async function logout(uid) {
    const label = uid === me.id ? "Выйти из этого аккаунта?" : "Выйти из этого аккаунта на этом устройстве?";
    if (!confirm(label)) return;
    const { remaining } = await api.logout(uid);
    if (remaining.length === 0) window.location.href = "/login";
    else window.location.reload();
  }
  async function logoutAll() {
    if (!confirm("Выйти из всех аккаунтов на этом устройстве?")) return;
    await api.logout();
    window.location.href = "/login";
  }

  mount(
    root,
    pageWrap("Аккаунты", "Аккаунты, открытые на этом устройстве", [
      el(
        "div",
        { class: "settings-accounts-list" },
        accounts.map((a) =>
          el("div", { class: `settings-account-row ${a.id === me.id ? "current" : ""}` }, [
            el("button", { class: "settings-account-main", onclick: () => switchTo(a.id) }, [
              Avatar({ name: a.name || a.phone, color: a.avatarColor, image: a.avatarImage, size: 36 }),
              el("span", { class: "settings-account-info" }, [
                el("span", { class: "settings-account-name" }, [a.name || a.phone || a.email, a.id === me.id ? el("span", { class: "settings-account-current-tag" }, " (текущий)") : null]),
                el("span", { class: "settings-account-sub" }, a.phone || a.email),
              ]),
            ]),
            el("button", { class: "icon-btn", title: "Выйти из аккаунта", html: iconSvg("LogOut", 16), onclick: () => logout(a.id) }),
          ])
        )
      ),
      el("button", { class: "settings-add-account-btn", onclick: () => (window.location.href = "/login?add=1") }, [
        el("span", { html: iconSvg("Plus", 16) }),
        " Добавить аккаунт",
      ]),
      el("div", { class: "settings-logout-block" }, [
        el("button", { class: "settings-logout-btn", onclick: () => logout(me.id) }, [el("span", { html: iconSvg("LogOut", 16) }), " Выйти из текущего аккаунта"]),
        accounts.length > 1 ? el("button", { class: "settings-logout-all", onclick: logoutAll }, "Выйти из всех аккаунтов") : null,
      ]),
    ])
  );
}

async function renderFolders(root) {
  const [{ folders: initialFolders }, { chats }] = await Promise.all([api.listFolders(), api.listChats()]);
  let folders = initialFolders;
  let editing = null;
  let creating = false;
  let newName = "";

  async function createFolder() {
    if (!newName.trim()) return;
    const { folder } = await api.createFolder(newName.trim(), []);
    folders = [...folders, folder];
    newName = "";
    creating = false;
    editing = folder;
    render();
  }
  async function toggleChat(folder, chatId) {
    const chatIds = folder.chatIds.includes(chatId) ? folder.chatIds.filter((id) => id !== chatId) : [...folder.chatIds, chatId];
    const updated = { ...folder, chatIds };
    editing = updated;
    folders = folders.map((f) => (f.id === folder.id ? updated : f));
    render();
    await api.patchFolder(folder.id, { chatIds });
  }
  async function remove(folder) {
    folders = folders.filter((f) => f.id !== folder.id);
    if (editing?.id === folder.id) editing = null;
    render();
    await api.deleteFolder(folder.id);
  }

  function render() {
    mount(
      root,
      pageWrap("Папки с чатами", "До 10 папок, в каждой — любой набор чатов", [
        el(
          "div",
          { class: "settings-folders-list" },
          folders.map((f) =>
            el("div", { class: "settings-folder-row" }, [
              el("button", { class: "settings-folder-name-btn", onclick: () => { editing = editing?.id === f.id ? null : f; render(); } }, [
                f.name,
                el("span", { class: "mono settings-toggle-hint" }, ` · ${f.chatIds.length}`),
              ]),
              el("button", { class: "icon-btn", html: iconSvg("Trash", 15), onclick: () => remove(f) }),
            ])
          )
        ),
        creating
          ? el("div", { class: "settings-folder-create-row" }, [
              el("input", { class: "settings-input", autofocus: true, value: newName, placeholder: "Название папки", oninput: (e) => (newName = e.target.value) }),
              el("button", { class: "btn-accent", onclick: createFolder }, "Создать"),
            ])
          : el("button", { class: "settings-add-account-btn", onclick: () => { creating = true; render(); } }, [el("span", { html: iconSvg("Plus", 15) }), " Новая папка"]),
        editing
          ? el("div", { class: "settings-folder-editor" }, [
              el("p", { class: "settings-field-label" }, `Чаты в папке «${editing.name}»`),
              ...chats.map((c) =>
                el("label", { class: "settings-folder-chat-check" }, [
                  el("input", { type: "checkbox", checked: editing.chatIds.includes(c.id), onchange: () => toggleChat(editing, c.id) }),
                  c.title,
                ])
              ),
            ])
          : null,
      ])
    );
  }
  render();
}

async function renderData(root) {
  const { settings: initial } = await api.getSettings();
  let settings = initial;
  const CACHE = [
    { label: "Фото", mb: 128 },
    { label: "Видео", mb: 640 },
    { label: "Файлы", mb: 42 },
    { label: "Голосовые", mb: 9 },
  ];
  const cleared = new Set();

  async function patch(p) {
    settings = { ...settings, ...p };
    render();
    await api.patchSettings(p);
  }

  function render() {
    const total = CACHE.reduce((a, c) => a + (cleared.has(c.label) ? 0 : c.mb), 0);
    mount(
      root,
      pageWrap("Данные и память", "Автозагрузка медиа и локальный кэш", [
        el("div", { class: "settings-toggle-row" }, [
          el("div", {}, [el("p", { class: "settings-toggle-title" }, "Автозагрузка медиа"), el("p", { class: "settings-toggle-hint" }, "Загружать фото и файлы автоматически")]),
          Toggle(settings.autoDownload, (v) => patch({ autoDownload: v })),
        ]),
        el("p", { class: "settings-field-label" }, `Использовано места — ${(total / 1024).toFixed(2)} ГБ`),
        el(
          "div",
          { class: "settings-cache-list" },
          CACHE.map((c) =>
            el("div", { class: "settings-cache-row" }, [
              el("span", {}, c.label),
              el("span", { class: "mono settings-toggle-hint" }, cleared.has(c.label) ? "0 МБ" : `${c.mb} МБ`),
              el(
                "button",
                { class: "settings-danger-link", disabled: cleared.has(c.label), onclick: () => { cleared.add(c.label); render(); } },
                "Очистить"
              ),
            ])
          )
        ),
      ])
    );
  }
  render();
}
