import { el, mount, clear } from "../../lib/dom.js";
import { iconSvg } from "../../icons.js";
import { Avatar } from "../../components/avatar.js";
import { api } from "../../api.js";
import { getState, setState } from "../../state.js";
import { navigate } from "../../router.js";
import { fileToAvatarDataUrl, fileToImageDataUrl } from "../../lib/image.js";
import { requestPushPermission } from "../../lib/push.js";
import { openContactPickerDialog } from "../../components/contactPickerDialog.js";
import { openCreateBotDialog } from "../../components/createBotDialog.js";
import { openBotTokenDialog } from "../../components/botTokenDialog.js";
import { openBotCodeDialog } from "../../components/botCodeDialog.js";

const SECTIONS = [
  { id: "", label: "Профиль" },
  { id: "premium", label: "Premium и друзья" },
  { id: "ads", label: "Реклама" },
  { id: "bots", label: "Боты" },
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
    premium: renderPremium,
    ads: renderAds,
    bots: renderBots,
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
      Avatar({ name: name || "?", color: me.avatarColor, image: avatarImage, size: 72, isPremium: me.isPremium, isDeveloper: me.isDeveloper, orbit: true }),
      el("span", { class: "settings-avatar-edit", html: iconSvg("Edit", 12) }),
    ]);

    mount(
      root,
      pageWrap("", null, [
        el("div", { class: "settings-profile-header" }, [
          avatarBtn,
          fileInput,
          el("div", {}, [
            el("p", { class: "settings-profile-name" }, [
              name || "Без имени",
              me.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
              me.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
            ]),
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

function formatPremiumUntil(info) {
  if (info.premiumForever) return "Активен навсегда";
  if (info.premiumUntil) {
    const d = new Date(info.premiumUntil);
    return `Активен до ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  }
  return "Уберите ограничения и получите золотой значок";
}

// Decorative hero for the Premium page — perk icons circling a crown, each
// item counter-rotated inside the spinning ring so the glyphs stay upright.
const ORBIT_ITEMS = [
  { icon: "Star", color: "#d9822e" },
  { icon: "Zap", color: "#6e56c6" },
  { icon: "Gift", color: "#2e56d9" },
  { icon: "Shield", color: "#1f9d63" },
  { icon: "Smile", color: "#c6403b" },
  { icon: "Video", color: "#1c9bd9" },
];

function premiumOrbit() {
  return el("div", { class: "premium-orbit" }, [
    el("div", { class: "premium-orbit-core", html: iconSvg("Crown", 26) }),
    el(
      "div",
      { class: "premium-orbit-ring" },
      ORBIT_ITEMS.map((item, i) =>
        el("div", { class: "premium-orbit-item", style: `--angle: ${(360 / ORBIT_ITEMS.length) * i}deg` }, [
          el("div", { class: "premium-orbit-item-icon", style: `--orbit-color: ${item.color}`, html: iconSvg(item.icon, 15) }),
        ])
      )
    ),
  ]);
}

async function renderPremium(root) {
  let info = await api.getPremiumInfo();
  let gifts = [];
  try {
    ({ gifts } = await api.listGifts());
  } catch {
    // Gift catalog is a nice-to-have on this page — Premium status/referrals
    // above still work fine even if this call fails for some reason.
  }
  let copied = false;
  let buying = false;
  let buyError = null;
  let giftPendingId = null;
  let giftError = null;

  function referralLink() {
    return `${window.location.origin}/login?ref=${info.referralCode}`;
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralLink());
    } catch {
      // Clipboard API can be unavailable (insecure context, permissions) —
      // the code is still shown on screen for manual copying either way.
    }
    copied = true;
    render();
    setTimeout(() => {
      copied = false;
      render();
    }, 1500);
  }

  async function buyPremium() {
    buying = true;
    buyError = null;
    render();
    try {
      const { chatId } = await api.requestPremium();
      navigate(`/chat/${chatId}`);
    } catch (err) {
      buyError = err.message;
    } finally {
      buying = false;
      render();
    }
  }

  async function sendGift(gift, recipient) {
    giftPendingId = gift.id;
    giftError = null;
    render();
    try {
      const { chatId } = await api.requestGift(gift.id, recipient.id);
      navigate(`/chat/${chatId}`);
    } catch (err) {
      giftError = err.message;
    } finally {
      giftPendingId = null;
      render();
    }
  }

  function pickRecipientAndSend(gift) {
    openContactPickerDialog((user) => sendGift(gift, user), `Кому подарить «${gift.name}»?`);
  }

  function render() {
    mount(
      root,
      pageWrap("Premium и друзья", "Реферальная программа, подписка Shalter Premium и подарки", [
        premiumOrbit(),
        el("div", { class: `premium-status-card ${info.isPremium ? "active" : ""}` }, [
          el("span", { class: "premium-status-icon", html: iconSvg("Crown", 26) }),
          el("div", {}, [
            el("p", { class: "premium-status-title" }, info.isPremium ? "У вас Shalter Premium" : "Shalter Premium не активен"),
            el("p", { class: "premium-status-hint" }, formatPremiumUntil(info)),
          ]),
        ]),
        !info.isPremium
          ? el("div", { class: "settings-notice-box" }, [
              el("p", { class: "settings-toggle-title" }, "Купить Premium на 30 дней — 10₽"),
              el("p", { class: "settings-toggle-hint" }, "Оплата переводом администрации Shalter. Нажмите «Купить» — откроется чат, переведите 10₽ и дождитесь подтверждения."),
              el("button", { class: "btn-accent", disabled: buying, onclick: buyPremium }, buying ? "Открываем чат…" : "Купить Premium"),
              buyError ? el("p", { class: "login-error" }, buyError) : null,
            ])
          : null,
        el("div", { class: "referral-card" }, [
          el("div", { class: "referral-card-header" }, [
            el("span", { html: iconSvg("Gift", 22) }),
            el("p", { class: "settings-toggle-title" }, "Пригласите друга — получите Premium"),
          ]),
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Когда друг зарегистрируется по вашему коду, Premium на 30 дней получите оба — бесплатно."
          ),
          el("div", { class: "referral-code-row" }, [
            el("span", { class: "mono referral-code-value" }, info.referralCode),
            el("button", { class: "icon-btn", title: "Скопировать ссылку-приглашение", html: iconSvg("Copy", 16), onclick: copyCode }),
          ]),
          copied ? el("p", { class: "settings-toggle-hint" }, "Ссылка скопирована ✓") : null,
        ]),
        el("p", { class: "settings-field-label" }, `Приглашено друзей — ${info.referrals.length}`),
        info.referrals.length === 0
          ? el("p", { class: "empty-hint" }, "Пока никто не зарегистрировался по вашему коду")
          : el(
              "div",
              { class: "settings-devices-list" },
              info.referrals.map((u) =>
                el("div", { class: "settings-device-row" }, [
                  Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 28 }),
                  el("div", { class: "settings-device-body" }, [el("p", {}, u.name)]),
                  u.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 14) }) : null,
                ])
              )
            ),
        gifts.length
          ? el("div", { class: "gifts-section" }, [
              el("p", { class: "settings-field-label" }, "Подарки"),
              el(
                "p",
                { class: "settings-toggle-hint" },
                "От розы за 1₽ до вечного Premium — как и с обычной покупкой, оплата переводом администрации Shalter, подарок приходит после подтверждения."
              ),
              giftError ? el("p", { class: "login-error" }, giftError) : null,
              el(
                "div",
                { class: "gifts-grid" },
                gifts.map((g, i) =>
                  el("div", { class: "gift-card" }, [
                    el("span", { class: "gift-card-emoji", style: `--gift-delay: ${(i % 8) * 0.15}s` }, g.emoji),
                    el("p", { class: "gift-card-name" }, g.name),
                    el("p", { class: "mono gift-card-price" }, `${g.priceRub}₽`),
                    el(
                      "button",
                      { class: "gift-card-btn", disabled: giftPendingId === g.id, onclick: () => pickRecipientAndSend(g) },
                      giftPendingId === g.id ? "…" : "Подарить"
                    ),
                  ])
                )
              ),
            ])
          : null,
      ])
    );
  }
  render();
}

async function renderAds(root) {
  let info = await api.getAdsInfo();
  let buying = false;
  let buyError = null;
  let saving = false;
  let saveStatus = null;

  async function buyAds() {
    buying = true;
    buyError = null;
    render();
    try {
      const { chatId } = await api.requestAds();
      navigate(`/chat/${chatId}`);
    } catch (err) {
      buyError = err.message;
    } finally {
      buying = false;
      render();
    }
  }

  async function saveContent(text, url) {
    saving = true;
    saveStatus = null;
    render();
    try {
      const { user } = await api.setAdContent(text, url);
      info = { ...info, adText: user.adText, adUrl: user.adUrl };
      saveStatus = "Сохранено ✓";
    } catch (err) {
      saveStatus = err.message || "Не удалось сохранить";
    } finally {
      saving = false;
      render();
      setTimeout(() => {
        saveStatus = null;
        render();
      }, 2000);
    }
  }

  function render() {
    const textInput = el("textarea", {
      class: "settings-input",
      rows: 3,
      maxlength: 200,
      placeholder: "Текст объявления (до 200 символов)",
      value: info.adText ?? "",
    });
    const urlInput = el("input", {
      class: "login-input",
      placeholder: "Ссылка (необязательно) — https://…",
      value: info.adUrl ?? "",
    });
    mount(
      root,
      pageWrap("Реклама", "Кабинет рекламы — покажите объявление на своей публичной странице профиля", [
        el("div", { class: `premium-status-card ${info.isAdsActive ? "active" : ""}` }, [
          el("span", { class: "premium-status-icon", html: iconSvg("Zap", 26) }),
          el("div", {}, [
            el("p", { class: "premium-status-title" }, info.isAdsActive ? "Кабинет рекламы активен" : "Кабинет рекламы не активен"),
            el(
              "p",
              { class: "premium-status-hint" },
              info.isAdsActive && info.adsUntil ? `Активен до ${new Date(info.adsUntil).toLocaleDateString("ru-RU")}` : "Объявление увидят все, кто откроет ваш профиль"
            ),
          ]),
        ]),
        !info.isAdsActive
          ? el("div", { class: "settings-notice-box" }, [
              el("p", { class: "settings-toggle-title" }, `Купить кабинет рекламы на 30 дней — ${info.priceRub}₽`),
              el(
                "p",
                { class: "settings-toggle-hint" },
                "Оплата переводом администрации Shalter. Нажмите «Купить» — откроется чат, переведите сумму и дождитесь подтверждения."
              ),
              el("button", { class: "btn-accent", disabled: buying, onclick: buyAds }, buying ? "Открываем чат…" : "Купить кабинет рекламы"),
              buyError ? el("p", { class: "login-error" }, buyError) : null,
            ])
          : null,
        info.isAdsActive
          ? el("div", { class: "settings-notice-box" }, [
              el("p", { class: "settings-field-label" }, "Ваше объявление"),
              textInput,
              urlInput,
              el(
                "button",
                { class: "btn-accent", disabled: saving, onclick: () => saveContent(textInput.value.trim(), urlInput.value.trim()) },
                saving ? "Сохраняем…" : "Сохранить объявление"
              ),
              saveStatus ? el("p", { class: "settings-toggle-hint" }, saveStatus) : null,
            ])
          : null,
      ])
    );
  }
  render();
}

async function renderBots(root) {
  let { bots } = await api.listBots();

  async function createBot() {
    openCreateBotDialog(async (name, avatarImage, description) => {
      const { bot, token } = await api.createBot(name, avatarImage, description);
      bots = [bot, ...bots];
      render();
      openBotTokenDialog(bot.user.name, token);
    });
  }

  async function regenerate(bot) {
    if (!confirm(`Обновить токен бота «${bot.user.name}»? Старый токен перестанет работать.`)) return;
    const { token } = await api.regenerateBotToken(bot.id);
    openBotTokenDialog(bot.user.name, token);
  }

  async function remove(bot) {
    if (!confirm(`Удалить бота «${bot.user.name}» безвозвратно?`)) return;
    await api.deleteBot(bot.id);
    bots = bots.filter((b) => b.id !== bot.id);
    render();
  }

  function render() {
    mount(
      root,
      pageWrap("Боты", "Настоящие боты, которых можно программировать как угодно", [
        el("div", { class: "settings-notice-box" }, [
          el("p", { class: "settings-toggle-title" }, "Два способа программировать бота" ),
          el(
            "p",
            { class: "settings-toggle-hint" },
            "1) Значок «</>» у бота — встроенный редактор кода с подсказками, код выполняется прямо на сервере Shalter. " +
              "2) Внешний скрипт (на любом языке) через Bot API и токен бота — см. документацию."
          ),
          el("a", { href: "/BOTS.md", target: "_blank", rel: "noreferrer", class: "text-link" }, "Открыть документацию по Bot API →"),
        ]),
        el("button", { class: "btn-accent", onclick: createBot }, [el("span", { html: iconSvg("Plus", 15) }), " Создать бота"]),
        el("p", { class: "settings-field-label" }, `Ваши боты — ${bots.length}`),
        bots.length === 0
          ? el("p", { class: "empty-hint" }, "У вас пока нет ботов")
          : el(
              "div",
              { class: "settings-devices-list" },
              bots.map((b) =>
                el("div", { class: "settings-device-row" }, [
                  Avatar({ name: b.user.name, color: b.user.avatarColor, image: b.user.avatarImage, size: 32 }),
                  el("div", { class: "settings-device-body" }, [
                    el("p", {}, b.user.name),
                    el("p", { class: "mono settings-toggle-hint" }, `@${b.user.username}`),
                  ]),
                  el("button", { class: "icon-btn", title: "Код бота", html: iconSvg("Code", 15), onclick: () => openBotCodeDialog(b) }),
                  el("button", { class: "icon-btn", title: "Обновить токен", html: iconSvg("Lock", 15), onclick: () => regenerate(b) }),
                  el("button", { class: "icon-btn", title: "Удалить бота", html: iconSvg("Trash", 15), onclick: () => remove(b) }),
                ])
              )
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
    { id: "custom", label: "Своё фото" },
  ];
  let wallpaperError = null;
  // Covers the world's most-spoken languages — Google Translate itself
  // supports 100+, but a dropdown of every ISO code is a worse UX than a
  // curated list (same tradeoff Telegram's own translate picker makes).
  const TRANSLATE_LANGUAGES = [
    { id: "ru", label: "Русский" },
    { id: "en", label: "English" },
    { id: "es", label: "Español" },
    { id: "zh-CN", label: "中文" },
    { id: "hi", label: "हिन्दी" },
    { id: "ar", label: "العربية" },
    { id: "pt", label: "Português" },
    { id: "fr", label: "Français" },
    { id: "de", label: "Deutsch" },
    { id: "ja", label: "日本語" },
    { id: "ko", label: "한국어" },
    { id: "tr", label: "Türkçe" },
    { id: "it", label: "Italiano" },
    { id: "pl", label: "Polski" },
    { id: "uk", label: "Українська" },
    { id: "vi", label: "Tiếng Việt" },
    { id: "th", label: "ไทย" },
    { id: "id", label: "Bahasa Indonesia" },
    { id: "fa", label: "فارسی" },
    { id: "kk", label: "Қазақша" },
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
    setState({ settings });
    render();
    await api.patchSettings(p);
  }

  async function pickCustomWallpaper(file) {
    if (!file) return;
    wallpaperError = null;
    try {
      const dataUrl = await fileToImageDataUrl(file, 1280);
      await patch({ chatWallpaper: "custom", chatWallpaperImage: dataUrl });
    } catch (err) {
      wallpaperError = err.message || "Не удалось загрузить фото";
      render();
    }
  }

  function render() {
    const wallpaperFileInput = el("input", {
      type: "file",
      accept: "image/*",
      class: "hidden-input",
      onchange: (e) => pickCustomWallpaper(e.target.files?.[0]),
    });
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
              {
                class: `settings-chip ${settings.chatWallpaper === w.id ? "active" : ""}`,
                onclick: () => (w.id === "custom" ? wallpaperFileInput.click() : patch({ chatWallpaper: w.id })),
              },
              w.label
            )
          )
        ),
        settings.chatWallpaper === "custom" && settings.chatWallpaperImage
          ? el("div", { class: "settings-wallpaper-preview", style: `background-image: url(${settings.chatWallpaperImage})` })
          : null,
        wallpaperFileInput,
        wallpaperError ? el("p", { class: "login-error" }, wallpaperError) : null,
        el("p", { class: "settings-field-label" }, "Язык перевода сообщений"),
        el(
          "select",
          { class: "settings-select", onchange: (e) => patch({ translateLanguage: e.target.value }) },
          TRANSLATE_LANGUAGES.map((l) => el("option", { value: l.id, selected: settings.translateLanguage === l.id }, l.label))
        ),
        el("p", { class: "settings-toggle-hint" }, "Кнопка «Перевести» в меню сообщения переводит его на этот язык"),
        el("p", { class: "settings-field-label" }, "Язык интерфейса"),
        el(
          "select",
          {
            class: "settings-select",
            onchange: async (e) => {
              await api.patchSettings({ uiLanguage: e.target.value });
              window.location.reload();
            },
          },
          TRANSLATE_LANGUAGES.map((l) => el("option", { value: l.id, selected: settings.uiLanguage === l.id }, l.label))
        ),
        el(
          "p",
          { class: "settings-toggle-hint" },
          "Переводит саму программу — кнопки, меню, надписи (не сообщения) — через Google Translate. Применяется после перезагрузки страницы."
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
  const { sessions } = await api.listSessions();

  function timeLabel(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
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
              el("p", { class: "settings-field-label" }, "Другие сеансы"),
              ...others.map((s) =>
                el("div", { class: "settings-device-row" }, [
                  el("span", { html: iconSvg("Phone", 16) }),
                  el("div", { class: "settings-device-body" }, [el("p", {}, s.device), el("p", { class: "mono settings-toggle-hint" }, `${s.location} · ${timeLabel(s.lastActive)}`)]),
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
