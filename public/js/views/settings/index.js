import { el, mount, clear } from "../../lib/dom.js";
import { iconSvg } from "../../icons.js";
import { Avatar } from "../../components/avatar.js";
import { api } from "../../api.js";
import { getState, setState } from "../../state.js";
import { navigate } from "../../router.js";
import { fileToImageDataUrl, fileToDataUrl } from "../../lib/image.js";
import { ImageAttachment, VideoAttachment, FileAttachment } from "../../components/attachments.js";
import { requestPushPermission } from "../../lib/push.js";
import { openCreateBotDialog } from "../../components/createBotDialog.js";
import { openBotTokenDialog } from "../../components/botTokenDialog.js";
import { openBotCodeDialog } from "../../components/botCodeDialog.js";
import { openEditBotDialog } from "../../components/editBotDialog.js";
import { PhoneField } from "../../components/phoneField.js";
import { hasPasscode } from "../../lib/passcodeLock.js";
import { openSetPasscodeDialog, openRemovePasscodeDialog } from "../../components/passcodeDialog.js";
import { openTwoFactorSetupDialog, openTwoFactorDisableDialog } from "../../components/twoFactorDialog.js";
import { openChangePasswordDialog, openChangeEmailDialog } from "../../components/credentialsDialog.js";
import { openStarsDialog } from "../../components/starsDialog.js";
import { openGiftShopDialog } from "../../components/giftShopDialog.js";
import { openAvatarViewer } from "../../components/avatarViewer.js";
import { Toggle } from "../../components/toggle.js";
import { openProfileQrDialog } from "../../components/profileQrDialog.js";
import { handlePurchaseResponse } from "../../lib/purchase.js";
import { WALLPAPER_GROUPS } from "../../lib/wallpapers.js";
import { openAdminUserPanel } from "../../components/adminUserPanel.js";
import { safetyLabelInfo } from "../../lib/safetyLabels.js";

// `color` gives each row's icon its own chip background (Telegram's own
// settings menu — every row's icon sits in a small colored square, not a
// flat muted icon) — fixed hex rather than a theme var since these chips
// stay the same color regardless of light/dark theme, same as Telegram's own.
const SECTIONS = [
  { id: "", label: "Профиль" },
  { id: "premium", label: "Premium и друзья", icon: "Star", color: "#f0a83c" },
  { id: "stars", label: "Звёзды", icon: "Zap", color: "#e0b33b" },
  { id: "ads", label: "Реклама", icon: "Zap", color: "#ef6f6f" },
  { id: "bots", label: "Боты", icon: "Code", color: "#3ec2c2" },
  { id: "appearance", label: "Внешний вид", icon: "Settings", color: "#8774e1" },
  { id: "notifications", label: "Уведомления", icon: "Bell", color: "#f2637f" },
  { id: "privacy", label: "Конфиденциальность", icon: "Lock", color: "#5b8def" },
  { id: "devices", label: "Устройства", icon: "Phone", color: "#4cc98a" },
  { id: "accounts", label: "Аккаунты", icon: "Accounts", color: "#c17fe0" },
  { id: "folders", label: "Папки", icon: "Archive", color: "#f2b33b" },
  { id: "data", label: "Данные и память", icon: "Download", color: "#58c4dc" },
  { id: "shortcuts", label: "Горячие клавиши", icon: "Keyboard", color: "#8a8f98" },
  { id: "moderation", label: "Модерация", icon: "Shield", color: "#c6403b", adminOnly: true },
  { id: "usernames", label: "Аукцион юзернеймов", icon: "Star", color: "#5b8def" },
  { id: "giftshop", label: "Каталог подарков", icon: "Gift", color: "#e0a84a", adminOnly: true },
  { id: "donations", label: "DonationAlerts", icon: "Zap", color: "#3ec2c2", adminOnly: true },
  { id: "legal", label: "Запросы органов", icon: "Shield", color: "#5b6370", adminOnly: true },
];

export async function SettingsView(root, page) {
  const section = page ?? "";
  const me = getState().user;
  const shell = el("div", { class: "settings-view" });
  const nav = el("div", { class: "settings-nav" }, [
    el("div", { class: "settings-nav-topbar" }, [
      el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
      el("span", { class: "settings-nav-topbar-title" }, "Настройки"),
      me.username
        ? el("button", {
            class: "icon-btn settings-nav-topbar-qr",
            title: "QR-код профиля",
            html: iconSvg("Qrcode", 18),
            onclick: () => openProfileQrDialog(me),
          })
        : null,
    ]),
    el(
      "a",
      {
        href: "/settings",
        "data-route": "1",
        class: `settings-nav-profile ${section === "" ? "active" : ""}`,
      },
      [
        Avatar({ name: me.name || "?", color: me.avatarColor, image: me.avatarImage, size: 48, isPremium: me.isPremium, isDeveloper: me.isDeveloper }),
        el("div", { class: "settings-nav-profile-info" }, [
          el("p", { class: "settings-nav-profile-name" }, me.name || "Профиль"),
          el("p", { class: "settings-nav-profile-sub" }, me.online ? "в сети" : "показать профиль"),
        ]),
      ]
    ),
    el(
      "div",
      { class: "settings-nav-list" },
      [
        ...SECTIONS.filter((s) => s.id && (!s.adminOnly || me.isDeveloper)).map((s) =>
          el(
            "a",
            {
              href: `/settings/${s.id}`,
              "data-route": "1",
              class: `settings-nav-item ${section === s.id ? "active" : ""}`,
            },
            [
              el("span", { class: "settings-nav-icon", style: { background: s.color }, html: iconSvg(s.icon, 16) }),
              el("span", { class: "settings-nav-label" }, s.label),
            ]
          )
        ),
        // The download page is a standalone static page, not an SPA route, so
        // this is a plain link with no data-route — the router must let the
        // browser navigate rather than trying to resolve it as a view. It sits
        // in the same list as the rest so that on a phone, where this nav is a
        // horizontal strip, it rides along instead of forming a second row.
        el("button", {
          class: "settings-nav-item",
          onclick: async () => {
            try {
              const { chatId } = await api.openSupportChat();
              navigate(`/chat/${chatId}`);
            } catch (err) {
              alert(err.message || "Не удалось открыть поддержку");
            }
          },
        }, [
          el("span", { class: "settings-nav-icon", style: { background: "#1f9d63" }, html: iconSvg("Info", 16) }),
          el("span", { class: "settings-nav-label" }, "Поддержка — Hugo"),
        ]),
        el("a", { href: "/download", class: "settings-nav-item settings-nav-external" }, [
          el("span", { class: "settings-nav-icon", style: { background: "#4cc98a" }, html: iconSvg("Download", 16) }),
          el("span", { class: "settings-nav-label" }, "Скачать приложение"),
        ]),
      ]
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
    shortcuts: renderShortcuts,
    moderation: renderModeration,
    donations: renderDonations,
    legal: renderLegal,
    stars: renderStars,
    giftshop: renderGiftShop,
    usernames: renderUsernames,
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

// Groups related rows into a rounded card with an optional purple caption
// above it — the "Sound Effects" / "Privacy" / "Color theme" grouping
// Telegram uses throughout Settings, instead of one long flat list.
function section(title, children) {
  return el("div", { class: "settings-section-group" }, [
    title ? el("p", { class: "settings-section-title" }, title) : null,
    el("div", { class: "settings-section" }, children),
  ]);
}

async function renderProfile(root) {
  const me = getState().user;
  let name = me.name;
  let username = me.username;
  let phone = me.phone ?? "";
  let bio = me.bio;
  let birthday = me.birthday ?? "";
  let avatarImage = me.avatarImage;
  let avatarImages = me.avatarImages ?? [];
  let phoneField = null;
  let saved = false;
  let profileError = null;

  function render() {
    // Opens the viewer rather than a bare file picker: it shows the photos
    // already there, and adding, reordering and deleting all live in one place
    // instead of the picker being the only thing this button could do.
    const avatarBtn = el(
      "button",
      {
        class: "settings-avatar-btn",
        onclick: () =>
          openAvatarViewer(
            { ...me, avatarImage, avatarImages },
            {
              canEdit: true,
              onChange: (updated) => {
                avatarImage = updated.avatarImage ?? null;
                avatarImages = updated.avatarImages ?? [];
                render();
              },
            }
          ),
      },
      [
        Avatar({ name: name || "?", color: me.avatarColor, image: avatarImage, size: 72, isPremium: me.isPremium, isDeveloper: me.isDeveloper, orbit: true }),
        el("span", { class: "settings-avatar-edit", html: iconSvg("Edit", 12) }),
        avatarImages.length > 1 ? el("span", { class: "avatar-count-badge" }, String(avatarImages.length)) : null,
      ].filter(Boolean)
    );

    mount(
      root,
      pageWrap("", null, [
        el("div", { class: "settings-profile-header" }, [
          avatarBtn,
          el("div", {}, [
            el("p", { class: "settings-profile-name" }, [
              name || "Без имени",
              me.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
              me.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
            ]),
            el("p", { class: "mono settings-profile-sub" }, me.phone || me.email),
          ]),
        ]),
        section(null, [
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Имя"),
            el("input", { class: "settings-input", value: name, oninput: (e) => (name = e.target.value) }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Юзернейм"),
            el("input", { class: "settings-input", value: username, oninput: (e) => (username = e.target.value.replace(/[^a-zA-Z0-9_]/g, "")) }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Телефон"),
            // Kept across renders — the picker holds the chosen country, and a
            // fresh one on each render would forget it mid-edit.
            (phoneField ??= PhoneField({ value: phone, onChange: (v) => (phone = v) })).el,
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "О себе"),
            el("textarea", { class: "settings-input", rows: 3, value: bio, oninput: (e) => (bio = e.target.value) }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Дата рождения"),
            el("input", { class: "settings-input", type: "date", value: birthday, oninput: (e) => (birthday = e.target.value) }),
          ]),
        ]),
        profileError ? el("p", { class: "login-error" }, profileError) : null,
        el(
          "button",
          {
            class: "btn-accent",
            onclick: async () => {
              profileError = null;
              try {
                const { user } = await api.updateProfile(me.id, { name, username, phone, bio, birthday });
                setState({ user: { ...getState().user, name, username, phone: user.phone, bio, birthday } });
                saved = true;
                render();
                setTimeout(() => {
                  saved = false;
                  render();
                }, 1500);
              } catch (err) {
                profileError = err.message || "Не удалось сохранить";
                render();
              }
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
  let copied = false;
  let buying = false;
  let buyError = null;

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
      const res = await api.requestPremium();
      handlePurchaseResponse(res);
    } catch (err) {
      buyError = err.message;
    } finally {
      buying = false;
      render();
    }
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
        el("p", { class: "settings-section-title" }, `Приглашено друзей — ${info.referrals.length}`),
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
        // One way into the gift catalogue, not two. This page used to render its
        // own grid of the same 286 gifts below — priced in roubles and wired to
        // the old "переведите и дождитесь подтверждения" flow, so the same rose
        // was 1₽ here and ⭐10 in the shop, and only one of the two buttons
        // actually delivered anything. The shop dialog is the real one.
        el("div", { class: "settings-toggle-row no-divider" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, "Магазин подарков"),
            el("p", { class: "settings-toggle-hint" }, "Цены в звёздах, отправка мгновенная"),
          ]),
          el("button", { class: "btn-accent-pill", onclick: () => openGiftShopDialog({}) }, "Открыть"),
        ]),
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
  let attachments = info.adAttachments ?? [];
  const MAX_AD_ATTACHMENTS = 6;

  async function buyAds() {
    buying = true;
    buyError = null;
    render();
    try {
      const res = await api.requestAds();
      handlePurchaseResponse(res);
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
      const { user } = await api.setAdContent(text, url, attachments);
      info = { ...info, adText: user.adText, adUrl: user.adUrl, adAttachments: user.adAttachments };
      attachments = user.adAttachments ?? [];
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

  // Same file-input/data-URL approach as the chat composer (composer.js) —
  // no separate upload endpoint, the attachment travels as client-authored
  // JSON same as a message's, validated server-side in routes/ads.js.
  const mediaFileInput = el("input", {
    type: "file",
    accept: "image/*,video/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || attachments.length >= MAX_AD_ATTACHMENTS) return;
      if (file.type.startsWith("image/")) {
        attachments = [...attachments, { kind: "image", name: file.name, url: await fileToImageDataUrl(file, 1600) }];
      } else if (file.type.startsWith("video/")) {
        attachments = [...attachments, { kind: "video", name: file.name, size: file.size, url: await fileToDataUrl(file) }];
      }
      render();
    },
  });
  const anyFileInput = el("input", {
    type: "file",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || attachments.length >= MAX_AD_ATTACHMENTS) return;
      attachments = [...attachments, { kind: "file", name: file.name, size: file.size, url: await fileToDataUrl(file) }];
      render();
    },
  });

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
    const attachmentsPreview = attachments.length
      ? el(
          "div",
          { class: "ad-attachments-preview" },
          attachments.map((a, i) =>
            el("div", { class: "ad-attachment-preview" }, [
              a.kind === "video" ? VideoAttachment(a) : a.kind === "image" ? ImageAttachment(a) : FileAttachment(a),
              el("button", {
                type: "button",
                class: "icon-btn ad-attachment-remove",
                title: "Удалить вложение",
                html: iconSvg("X", 14),
                onclick: () => {
                  attachments = attachments.filter((_, j) => j !== i);
                  render();
                },
              }),
            ])
          )
        )
      : null;
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
              info.isAdsActive && info.adsForever
                ? "Активен навсегда"
                : info.isAdsActive && info.adsUntil
                ? `Активен до ${new Date(info.adsUntil).toLocaleDateString("ru-RU")}`
                : "Объявление увидят все, кто откроет ваш профиль"
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
              attachmentsPreview,
              el("div", { class: "ad-attach-row" }, [
                el(
                  "button",
                  { type: "button", class: "profile-action-btn", disabled: attachments.length >= MAX_AD_ATTACHMENTS, onclick: () => mediaFileInput.click() },
                  "Фото/видео"
                ),
                el(
                  "button",
                  { type: "button", class: "profile-action-btn", disabled: attachments.length >= MAX_AD_ATTACHMENTS, onclick: () => anyFileInput.click() },
                  "Файл"
                ),
                mediaFileInput,
                anyFileInput,
              ]),
              attachments.length >= MAX_AD_ATTACHMENTS
                ? el("p", { class: "settings-toggle-hint" }, `Максимум ${MAX_AD_ATTACHMENTS} вложений`)
                : null,
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
        el("p", { class: "settings-section-title" }, `Ваши боты — ${bots.length}`),
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
                  el("button", {
                    class: "icon-btn",
                    title: "Редактировать бота",
                    html: iconSvg("Edit", 15),
                    onclick: () =>
                      openEditBotDialog(b, async () => {
                        ({ bots } = await api.listBots());
                        render();
                      }),
                  }),
                  el("button", { class: "icon-btn", title: "Код бота", html: iconSvg("Code", 15), onclick: () => openBotCodeDialog(b) }),
                  // The command list the "/" button in a chat with this bot
                  // offers. BotFather's own format, so anyone who has set up a
                  // Telegram bot already knows what to type here.
                  el("button", {
                    class: "icon-btn",
                    title: "Команды бота",
                    html: iconSvg("BarChart", 15),
                    onclick: async () => {
                      const current = (b.commands ?? []).map((c) => `${c.command} - ${c.description ?? ""}`.trim()).join("\n");
                      const next = prompt(
                        "Команды бота, по одной в строке:\n\nstart - Начать\nhelp - Помощь",
                        current
                      );
                      if (next === null) return;
                      const commands = next
                        .split("\n")
                        .map((line) => {
                          const [cmd, ...rest] = line.split(/\s*-\s*/);
                          return { command: (cmd ?? "").trim(), description: rest.join(" - ").trim() };
                        })
                        .filter((c) => c.command);
                      try {
                        await api.setBotCommands(b.id, commands);
                        ({ bots } = await api.listBots());
                        render();
                      } catch (err) {
                        alert(err.message || "Не удалось сохранить команды");
                      }
                    },
                  }),
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
        section("Настройки", [
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("span", { class: "settings-toggle-title" }, "Размер шрифта сообщений"),
            el("span", { class: "mono settings-toggle-hint" }, `${settings.fontSize}px`),
          ]),
          el("input", {
            type: "range",
            min: 13,
            max: 19,
            value: settings.fontSize,
            class: "settings-range",
            oninput: (e) => patch({ fontSize: Number(e.target.value) }),
          }),
        ]),
        section("Тема", [
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
        ]),
        section("Акцентный цвет", [
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
        ]),
        section("Фон чата", [
          el("p", { class: "settings-toggle-hint" }, "Общий фон по умолчанию — отдельный фон для конкретного чата задаётся в самом чате через меню «⋯» → «Фон чата»."),
          ...WALLPAPER_GROUPS.flatMap((group) => [
            el("p", { class: "wallpaper-picker-group-label" }, group.label),
            el(
              "div",
              { class: "wallpaper-picker-grid" },
              group.items.map((w) =>
                el(
                  "button",
                  {
                    class: `wallpaper-picker-swatch ${settings.chatWallpaper === w.id ? "active" : ""}`,
                    title: w.label,
                    onclick: () => (w.id === "custom" ? wallpaperFileInput.click() : patch({ chatWallpaper: w.id })),
                  },
                  [
                    el("span", {
                      class: `message-list wallpaper-picker-swatch-fill wallpaper-${w.id}`,
                      style:
                        w.id === "custom" && settings.chatWallpaper === "custom" && settings.chatWallpaperImage
                          ? `background-image: url(${settings.chatWallpaperImage})`
                          : undefined,
                      html:
                        w.id === "custom" && !(settings.chatWallpaper === "custom" && settings.chatWallpaperImage)
                          ? iconSvg("Plus", 18, "wallpaper-picker-swatch-plus")
                          : undefined,
                    }),
                  ]
                )
              )
            ),
          ]),
          wallpaperFileInput,
          wallpaperError ? el("p", { class: "login-error" }, wallpaperError) : null,
        ]),
        section("Язык", [
          el("div", { class: "settings-field" }, [
            el("p", { class: "settings-field-label" }, "Перевод сообщений"),
            el(
              "select",
              { class: "settings-select", onchange: (e) => patch({ translateLanguage: e.target.value }) },
              TRANSLATE_LANGUAGES.map((l) => el("option", { value: l.id, selected: settings.translateLanguage === l.id }, l.label))
            ),
            el("p", { class: "settings-toggle-hint" }, "Кнопка «Перевести» в меню сообщения переводит его на этот язык"),
          ]),
          el("div", { class: "settings-field" }, [
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
          ]),
        ]),
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
        section("Уведомления", [
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
  let passcodeOn = hasPasscode();
  // Real 2FA (server/lib/totp.js), distinct from the local passcode below: the
  // passcode locks this device's app, 2FA gates getting into the account at all.
  let twoFactor = { enabled: false, recoveryCodesLeft: 0 };
  api
    .getTwoFactor()
    .then((res) => {
      twoFactor = res;
      render();
    })
    .catch(() => {});
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

  async function deleteAccount() {
    openDeleteAccountDialog(async (password) => {
      await api.deleteAccount(password);
      window.location.href = "/login";
    });
  }

  function changePasscode() {
    openSetPasscodeDialog(() => {
      passcodeOn = true;
      render();
    });
  }

  function disablePasscode() {
    openRemovePasscodeDialog(() => {
      passcodeOn = false;
      render();
    });
  }

  // Shown under the security section after a password/e-mail change — the same
  // "state changed, re-render" pattern the rest of this page uses.
  let securityNotice = null;

  function enableTwoFactor() {
    openTwoFactorSetupDialog(async () => {
      twoFactor = await api.getTwoFactor().catch(() => ({ enabled: true, recoveryCodesLeft: 0 }));
      render();
    });
  }

  function disableTwoFactor() {
    openTwoFactorDisableDialog(() => {
      twoFactor = { enabled: false, recoveryCodesLeft: 0 };
      render();
    });
  }

  function render() {
    const blockedUsers = allUsers.filter((u) => blockedIds.has(u.id));
    mount(
      root,
      pageWrap("Конфиденциальность", "Кто видит вашу информацию", [
        section("Приватность", [
          row("Последний визит", "lastSeen"),
          row("Номер телефона", "phone"),
          // Distinct from the row above: that one is about who can *see* the
          // number, this one about who can find the account *by* it (contact
          // import — server/routes/contacts.js's /match).
          row("Кто найдёт меня по номеру", "discoverByPhone"),
          row("Фото профиля", "photo"),
          row("О себе", "bio"),
          row("Дата рождения", "birthday"),
          row("Ссылка при пересылке", "forwards"),
          row("Кто добавляет меня в группы", "invites"),
          row("Кто может мне звонить", "calls"),
        ]),
        section("Безопасность", [
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Двухфакторная аутентификация"),
              el(
                "p",
                { class: "settings-toggle-hint" },
                twoFactor.enabled
                  ? `Включена (${twoFactor.method === "chat" ? "код в чате Shalter" : "приложение-аутентификатор"}). Кодов восстановления осталось: ${twoFactor.recoveryCodesLeft}`
                  : "Код при каждом входе — в чате Shalter или из приложения-аутентификатора. Знать пароль или ваш номер будет недостаточно"
              ),
            ]),
            twoFactor.enabled
              ? el("button", { class: "settings-danger-link", onclick: disableTwoFactor }, "Отключить")
              : el("button", { class: "settings-danger-link", onclick: enableTwoFactor }, "Включить"),
          ]),
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Пароль"),
              el("p", { class: "settings-toggle-hint" }, "Пароль от аккаунта. При смене все остальные сеансы завершаются"),
            ]),
            el(
              "button",
              {
                class: "settings-danger-link",
                onclick: () =>
                  openChangePasswordDialog(() => {
                    securityNotice = "Пароль изменён, остальные сеансы завершены";
                    render();
                  }),
              },
              "Изменить"
            ),
          ]),
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Почта"),
              el(
                "p",
                { class: "settings-toggle-hint" },
                getState().user.email
                  ? `${getState().user.email} — по этому адресу восстанавливают доступ`
                  : "Не указана. По ней восстанавливают доступ, если забыт пароль"
              ),
            ]),
            el(
              "button",
              {
                class: "settings-danger-link",
                onclick: () =>
                  openChangeEmailDialog(getState().user.email, (user) => {
                    // The address is on the state object the whole app reads, so
                    // the hint above must not keep showing the old one.
                    if (user) setState({ user: { ...getState().user, email: user.email } });
                    securityNotice = "Адрес почты изменён";
                    render();
                  }),
              },
              getState().user.email ? "Изменить" : "Указать"
            ),
          ]),
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Код-пароль"),
              el("p", { class: "settings-toggle-hint" }, "Локальный PIN на этом устройстве — не связан с аккаунтом"),
            ]),
            passcodeOn
              ? el("div", { class: "settings-passcode-actions" }, [
                  el("button", { class: "settings-danger-link", onclick: changePasscode }, "Изменить"),
                  el("button", { class: "settings-danger-link", onclick: disablePasscode }, "Отключить"),
                ])
              : el("button", { class: "settings-danger-link", onclick: changePasscode }, "Включить"),
          ]),
          securityNotice ? el("p", { class: "settings-toggle-hint success" }, securityNotice) : null,
        ]),
        el("p", { class: "settings-section-title" }, `Заблокированные пользователи (${blockedUsers.length})`),
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
        el("div", { class: "settings-logout-block" }, [
          el("button", { class: "settings-logout-btn", onclick: deleteAccount }, [
            el("span", { html: iconSvg("Trash", 16) }),
            " Удалить аккаунт",
          ]),
          el("p", { class: "settings-toggle-hint" }, "Безвозвратно удаляет аккаунт, чаты и ботов. Отменить нельзя."),
        ]),
      ])
    );
  }
  render();
}

// Password re-confirmation before the irreversible delete-account call (see
// server/lib/deleteAccount.js) — a small one-off modal rather than a new
// component file, since this is the only place it's used.
function openDeleteAccountDialog(onConfirm) {
  let error = null;
  let busy = false;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const passwordInput = el("input", { class: "login-input", type: "password", placeholder: "Пароль", autofocus: true });

  function close() {
    overlay.remove();
  }

  function renderDialog() {
    const dialog = el("div", { class: "modal-dialog choice-dialog" }, [
      el("h2", { class: "modal-title" }, "Удалить аккаунт"),
      el("p", { class: "settings-toggle-hint" }, "Это действие необратимо. Все ваши чаты, боты и данные будут удалены навсегда. Введите пароль для подтверждения."),
      passwordInput,
      error ? el("p", { class: "login-error" }, error) : null,
      el(
        "button",
        {
          class: "choice-dialog-btn danger",
          disabled: busy,
          onclick: async () => {
            error = null;
            busy = true;
            renderDialog();
            try {
              await onConfirm(passwordInput.value);
              close();
            } catch (err) {
              error = err.message || "Не удалось удалить аккаунт";
              busy = false;
              renderDialog();
            }
          },
        },
        busy ? "Удаляем…" : "Удалить безвозвратно"
      ),
      el("button", { class: "modal-cancel", onclick: () => close() }, "Отмена"),
    ]);
    // passwordInput is the same node re-appended each render (not recreated),
    // so moving it into the fresh dialog preserves its value/focus.
    overlay.textContent = "";
    overlay.appendChild(dialog);
  }

  renderDialog();
  document.body.appendChild(overlay);
}

async function renderDevices(root) {
  let { sessions } = await api.listSessions();
  let busyId = null;

  function timeLabel(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  }

  async function terminate(deviceId) {
    if (!confirm("Завершить этот сеанс? Устройство будет разлогинено.")) return;
    busyId = deviceId;
    render();
    try {
      await api.terminateSession(deviceId);
      sessions = sessions.filter((s) => s.deviceId !== deviceId);
    } finally {
      busyId = null;
      render();
    }
  }

  async function terminateOthers() {
    if (!confirm("Завершить все остальные сеансы? Все устройства, кроме этого, будут разлогинены.")) return;
    busyId = "others";
    render();
    try {
      await api.terminateOtherSessions();
      sessions = sessions.filter((s) => s.current);
    } finally {
      busyId = null;
      render();
    }
  }

  // Layout matches Telegram Web's own Active Sessions screen: the current
  // device sits alone under "Это устройство" with the red "terminate all
  // others" action directly beneath it (plus a hint line under *that*, not
  // inside the card), then every other session gets its own "Активные
  // сеансы" group below.
  function render() {
    const current = sessions.find((s) => s.current);
    const others = sessions.filter((s) => !s.current);
    mount(
      root,
      pageWrap("Устройства", null, [
        current
          ? section("Это устройство", [
              el("div", { class: "settings-device-row current" }, [
                el("div", { class: "settings-device-body" }, [
                  el("p", { class: "settings-device-name" }, current.device),
                  el("p", { class: "mono settings-toggle-hint" }, current.location),
                ]),
              ]),
              others.length
                ? el(
                    "button",
                    { class: "settings-danger-link with-icon", disabled: busyId === "others", onclick: terminateOthers },
                    [el("span", { html: iconSvg("X", 14) }), "Завершить все остальные сеансы"]
                  )
                : null,
            ])
          : null,
        others.length ? el("p", { class: "settings-toggle-hint device-list-hint" }, "Выйти на всех устройствах, кроме этого.") : null,
        others.length
          ? section(
              "Активные сеансы",
              others.map((s) =>
                el("div", { class: "settings-device-row" }, [
                  el("div", { class: "settings-device-body" }, [
                    el("p", { class: "settings-device-name" }, [s.device, el("span", { class: "settings-device-time" }, timeLabel(s.lastActive))]),
                    el("p", { class: "mono settings-toggle-hint" }, s.location),
                  ]),
                  el(
                    "button",
                    { class: "icon-btn danger", title: "Завершить", disabled: busyId === s.deviceId, onclick: () => terminate(s.deviceId) },
                    busyId === s.deviceId ? "…" : el("span", { html: iconSvg("X", 14) })
                  ),
                ])
              )
            )
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

async function renderData(root) {
  const { settings: initial } = await api.getSettings();
  let settings = initial;
  let usage = null; // { bytesByBucket } once loaded
  let usageError = null;

  api
    .getStorageUsage()
    .then((r) => {
      usage = r;
      render();
    })
    .catch((err) => {
      usageError = err.message || "Не удалось посчитать";
      render();
    });

  async function patch(p) {
    settings = { ...settings, ...p };
    render();
    await api.patchSettings(p);
  }

  // Real, per-account totals computed server-side from actual attachment
  // bytes (server/routes/settings.js's /storage) — this app has no separate
  // device cache to measure (attachments live in the message row itself, see
  // AGENTS.md), so unlike Telegram's own version of this screen there's
  // nothing safe to "clear" here without deleting real chat history. Showing
  // honest numbers with no clear button beats a clear button that either
  // does nothing or silently deletes messages the user didn't ask to delete.
  const BUCKETS = [
    { key: "photos", label: "Фото" },
    { key: "videos", label: "Видео" },
    { key: "files", label: "Файлы" },
    { key: "voice", label: "Голосовые" },
  ];

  function render() {
    const total = usage ? Object.values(usage.bytesByBucket).reduce((a, b) => a + b, 0) : 0;
    mount(
      root,
      pageWrap("Данные и память", "Автозагрузка медиа и реальный объём вложений в переписке", [
        section("Автозагрузка", [
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Автозагрузка медиа"),
              el("p", { class: "settings-toggle-hint" }, "Выключено — фото и видео открываются по нажатию, а не сразу"),
            ]),
            Toggle(settings.autoDownload, (v) => patch({ autoDownload: v })),
          ]),
        ]),
        el("p", { class: "settings-section-title" }, usage ? `Использовано места — ${formatBytes(total)}` : "Использовано места"),
        usageError
          ? el("p", { class: "empty-hint" }, usageError)
          : !usage
            ? el("p", { class: "empty-hint" }, "Считаем…")
            : el(
                "div",
                { class: "settings-cache-list" },
                BUCKETS.map((b) =>
                  el("div", { class: "settings-cache-row" }, [
                    el("span", {}, b.label),
                    el("span", { class: "mono settings-toggle-hint" }, formatBytes(usage.bytesByBucket[b.key] ?? 0)),
                  ])
                )
              ),
      ])
    );
  }
  render();
}

function shortcutRow(label, keys) {
  return el("div", { class: "settings-shortcut-row" }, [
    el("span", {}, label),
    el(
      "span",
      { class: "settings-shortcut-keys" },
      keys.map((k) => el("kbd", { class: "kbd" }, k))
    ),
  ]);
}

// Only real, wired-up shortcuts (see lib/keyboardShortcuts.js) — listing ones
// that don't actually do anything would just be misleading.
async function renderShortcuts(root) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";
  mount(
    root,
    pageWrap("Горячие клавиши", null, [
      section("Чат", [shortcutRow("Открыть поиск", [mod, "F"])]),
      section("Навигация", [
        shortcutRow("Следующий чат", ["Alt", "↓"]),
        shortcutRow("Предыдущий чат", ["Alt", "↑"]),
        shortcutRow("Закрыть чат / окно", ["Esc"]),
      ]),
    ])
  );
}

// Admin-only (see SECTIONS' adminOnly flag) — connects DonationAlerts so
// Premium/Реклама/Gift purchases become real automatic payments instead of
// the "message the admin, they confirm by hand" fallback (server/lib/
// donationAlerts.js). Env vars (DONATIONALERTS_CLIENT_ID/SECRET/REDIRECT_URI)
// have to be set on the server first — there's no UI for those since they're
// app-wide OAuth app credentials, not something to type into a settings form.
// Admin-only (SECTIONS' adminOnly flag → server also gates every /api/admin
// route). The moderation ledger: what's still open, who is banned and why, and
// who carries a public safety label. Reports also arrive as messages in the
// admin's chat with the service bot (server/routes/reports.js) — but a chat
// message scrolls away, so a ban set from one used to be unreviewable and,
// worse, un-liftable. Every row here opens the per-user panel
// (components/adminUserPanel.js), which is where unbanning, labelling, reading
// the reports against an account and exporting its data actually happen.
async function renderModeration(root) {
  let data = null;
  let error = null;
  // Kept apart from `error`: that one means "the screen couldn't load" and
  // replaces the whole page, while a failed lookup should leave the reports and
  // lists exactly where they were and just say the handle wasn't found.
  let lookupError = null;
  // Проверка отправки почты — по кнопке, а не при открытии страницы: она
  // подключается к чужому серверу и занимает секунды.
  let mailStatus = null;
  let mailBusy = false;

  async function checkMail() {
    mailBusy = true;
    render();
    try {
      mailStatus = await api.adminMailStatus();
    } catch (err) {
      mailStatus = { from: "—", configured: true, ok: false, error: err.message || "не удалось проверить", directEnabled: false };
    }
    mailBusy = false;
    render();
  }

  async function load() {
    try {
      data = await api.adminModeration();
    } catch (err) {
      error = err.message || "Не удалось загрузить данные модерации";
    }
    render();
  }

  // Reports name a user id, not a full user object — good enough for the panel,
  // which reloads what it needs itself.
  function openPanel(u) {
    openAdminUserPanel(u, () => load());
  }

  function userRow(u, meta) {
    const info = safetyLabelInfo(u.safetyLabel);
    return el("button", { class: "moderation-row", onclick: () => openPanel(u) }, [
      el("div", { class: "moderation-row-body" }, [
        el("p", { class: "moderation-row-name" }, [
          u.name,
          info ? el("span", { class: `safety-badge safety-mini safety-${u.safetyLabel}` }, info.short) : null,
        ]),
        el("p", { class: "moderation-row-meta" }, meta),
      ]),
      el("span", { class: "moderation-row-chevron", html: iconSvg("ChevronLeft", 16) }),
    ]);
  }

  function render() {
    clear(root);
    if (error) {
      mount(root, pageWrap("Модерация", null, [el("p", { class: "login-error" }, error)]));
      return;
    }
    if (!data) {
      mount(root, pageWrap("Модерация", null, [el("p", { class: "settings-toggle-hint" }, "Загружаем…")]));
      return;
    }

    // Any account, by handle / phone / id. The moderation screen previously only
    // listed accounts that were *already* banned or labelled, so acting on
    // anyone else meant finding their profile in a chat first — which for a
    // reported stranger is exactly what you can't do.
    const lookupInput = el("input", { class: "settings-input", placeholder: "@юзернейм, +7… или id" });
    async function lookup() {
      const q = lookupInput.value.trim();
      lookupError = null;
      if (!q) return;
      try {
        const { user } = await api.adminLookupUser(q);
        openPanel(user);
      } catch (err) {
        lookupError = err.message || "Пользователь не найден";
        render();
      }
    }

    // Built with section() like every other settings page — hand-rolling
    // .settings-section-title + .settings-section as bare siblings (which this
    // did at first) skips .settings-section-group's bottom margin entirely, so
    // the three groups ran into each other with no gap and each heading hugged
    // the card above it.
    const empty = (text) => el("p", { class: "moderation-empty" }, text);

    mount(
      root,
      pageWrap("Модерация", "Жалобы, блокировки и метки безопасности. Нажмите на строку, чтобы открыть карточку пользователя.", [
        section("Найти любой аккаунт", [
          lookupInput,
          el("button", { class: "btn-accent", onclick: lookup }, "Открыть карточку"),
          lookupError ? el("p", { class: "login-error" }, lookupError) : null,
          el(
            "p",
            { class: "settings-toggle-hint" },
            "В карточке — выдача Premium, рекламы, звёзд и подарков, метка безопасности, блокировка и разблокировка, жалобы и выгрузка данных."
          ),
        ]),
        section("Отправка почты", [
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Коды восстановления и подтверждение адреса уходят письмом. Проверка подключается к SMTP-серверу и входит под указанным ящиком — так видно, дело в пароле, в закрытом порте или в самом адресе."
          ),
          el("button", { class: "profile-action-btn", disabled: mailBusy, onclick: checkMail }, mailBusy ? "Проверяем…" : "Проверить отправку"),
          mailStatus
            ? el("div", {}, [
                el("p", { class: "mono settings-toggle-hint" }, `Отправитель: ${mailStatus.from}`),
                // Записи показываются здесь, потому что добавить их может только
                // владелец домена — а консоли, где обычно запускают
                // scripts/mail-dns.js, у него может не быть вовсе.
                ...(mailStatus.dns?.records?.length
                  ? [
                      el(
                        "p",
                        { class: "settings-toggle-hint" },
                        `DNS домена ${mailStatus.dns.domain}${mailStatus.dns.ip ? ` (адрес сервера ${mailStatus.dns.ip})` : ""} — добавьте в редакторе DNS у регистратора:`
                      ),
                      ...mailStatus.dns.records.map((r) =>
                        el("div", { class: "mail-dns-record" }, [
                          el("p", { class: "mail-dns-head" }, [
                            el("span", { class: `mail-dns-flag ${r.published ? "ok" : "todo"}` }, r.published ? "✓ опубликована" : "нужно добавить"),
                            el("span", { class: "mail-dns-kind" }, ` ${r.kind} · тип TXT · имя `),
                            el("span", { class: "mono" }, r.name),
                          ]),
                          el("textarea", { class: "settings-input mono mail-dns-value", rows: 2, readonly: true, value: r.value, onclick: (e) => e.target.select() }),
                          el("p", { class: "settings-toggle-hint" }, r.note),
                        ])
                      ),
                    ]
                  : []),
                mailStatus.configured
                  ? el(
                      "p",
                      { class: mailStatus.ok ? "settings-toggle-hint success" : "login-error" },
                      mailStatus.ok ? "SMTP настроен, вход выполнен — письма уходят." : `SMTP отвечает отказом: ${mailStatus.error}`
                    )
                  : el(
                      "p",
                      { class: "settings-toggle-hint" },
                      mailStatus.directEnabled
                        ? "SMTP не задан. Письма отдаются серверу получателя напрямую — mail.ru и yandex принимают, gmail отказывает."
                        : "SMTP не задан, прямая отправка выключена — письма никуда не уходят."
                    ),
              ])
            : null,
        ]),
        section(
          `Открытые жалобы (${data.openReports.length})`,
          data.openReports.length === 0
            ? [empty("Необработанных жалоб нет")]
            : data.openReports.map((r) =>
                el("div", { class: "moderation-report" }, [
                  el("p", { class: "moderation-report-head" }, [
                    el("span", { class: "moderation-report-reason" }, r.reasonLabel),
                    el("span", { class: "mono moderation-report-date" }, new Date(r.at).toLocaleString("ru-RU")),
                  ]),
                  el("p", { class: "moderation-row-meta" }, `На: ${r.subject ? r.subject.name : "—"} · от: ${r.reporter.name}`),
                  r.quoted ? el("p", { class: "admin-report-quote" }, `«${r.quoted}»`) : null,
                  r.details ? el("p", { class: "admin-report-details" }, `Пояснение: ${r.details}`) : null,
                  r.subject
                    ? el("button", { class: "profile-action-btn moderation-open-btn", onclick: () => openPanel(r.subject) }, "Открыть карточку")
                    : null,
                ])
              )
        ),
        section(
          `Заблокированные (${data.banned.length})`,
          data.banned.length === 0
            ? [empty("Заблокированных аккаунтов нет")]
            : data.banned.map((u) =>
                userRow(
                  u,
                  `${u.bannedAt ? new Date(u.bannedAt).toLocaleString("ru-RU") : "дата неизвестна"} · ${u.banReason || "причина не указана"}`
                )
              )
        ),
        section(
          `С метками безопасности (${data.labeled.length})`,
          data.labeled.length === 0
            ? [empty("Помеченных аккаунтов нет")]
            : data.labeled.map((u) => userRow(u, u.safetyLabelAt ? new Date(u.safetyLabelAt).toLocaleString("ru-RU") : ""))
        ),
      ])
    );
  }

  render();
  await load();
}

// Admin-only (SECTIONS' adminOnly flag → server also gates every /api/admin
// route to the ADMIN_PHONE holder). Lawful-request compliance: export ONE
// named user's stored correspondence in response to a legal basis, with the
// action logged. Deliberately not a "read everyone" surface — you resolve a
// specific person, state a reason, and get a file.
// Admin-only. The shipped catalogue is code (server/data/gifts.js) — this
// screen edits the part that lives in the database: how big a limited run is,
// and any gifts the admin mints themselves.
// The stars screen is the dialog — one place that knows about balances, packs
// and the per-account message price, rather than two copies drifting apart.
async function renderStars(root) {
  let info = null;
  try {
    info = await api.getStars();
  } catch {
    /* the dialog reports its own errors */
  }
  mount(
    root,
    pageWrap("Звёзды", "Внутренняя валюта: платные сообщения, поднятие и удаление", [
      section(null, [
        el("div", { class: "settings-toggle-row no-divider" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, info ? `${info.balance} ⭐ на балансе` : "Звёзды"),
            el("p", { class: "settings-toggle-hint" }, "Купить, посмотреть расценки и настроить плату за сообщения вам"),
          ]),
          el("button", { class: "btn-accent-pill", onclick: () => openStarsDialog(() => renderStars(root)) }, "Открыть"),
        ]),
      ]),
    ])
  );
}

// The username auction (server/routes/usernames.js). Visible to everyone —
// bidding is the point — with the create/close/grant controls appearing only for
// whoever holds ADMIN_PHONE, which the server reports rather than the client
// guessing from a phone number.
async function renderUsernames(root) {
  let data = null;
  let error = null;
  let notice = null;
  let busy = false;

  async function load() {
    try {
      data = await api.listUsernameAuctions();
    } catch (err) {
      error = err.message || "Не удалось загрузить аукционы";
    }
    render();
  }

  async function act(fn, ok) {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    render();
    try {
      await fn();
      notice = ok;
      data = await api.listUsernameAuctions();
    } catch (err) {
      error = err.message || "Не получилось";
    } finally {
      busy = false;
      render();
    }
  }

  const left = (endsAt) => {
    const ms = new Date(endsAt) - Date.now();
    if (ms <= 0) return "завершается…";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h ? `осталось ${h} ч ${m} мин` : `осталось ${m} мин`;
  };

  const STATUS = { open: "идёт", sold: "продан", unsold: "не продан", cancelled: "отменён" };

  function auctionCard(a) {
    const isTop = a.topBidderId && data.auctions.some((x) => x.id === a.id && x.myBid === a.topBid);
    return el("div", { class: `auction-card ${a.status !== "open" ? "closed" : ""}` }, [
      el("div", { class: "auction-head" }, [
        el("span", { class: "mono auction-name" }, `@${a.username}`),
        el("span", { class: "auction-status" }, a.status === "open" ? left(a.endsAt) : STATUS[a.status] ?? a.status),
      ]),
      el(
        "p",
        { class: "settings-toggle-hint" },
        a.topBid == null
          ? `Стартовая цена: ${a.startPriceStars} ⭐ — ставок пока нет`
          : `Текущая ставка: ${a.topBid} ⭐ · ${a.topBidder?.name ?? "участник"}${isTop ? " (это вы)" : ""}`
      ),
      a.status === "sold" ? el("p", { class: "settings-toggle-hint" }, `Продан за ${a.soldForStars} ⭐`) : null,
      a.myBid != null && a.status === "open"
        ? el("p", { class: "settings-toggle-hint" }, `Ваша ставка: ${a.myBid} ⭐`)
        : null,
      a.status === "open"
        ? (() => {
            const floor = a.topBid == null ? a.startPriceStars : a.topBid + data.minStep;
            const input = el("input", { class: "settings-input mono", type: "number", min: String(floor), value: String(floor) });
            return el("div", { class: "auction-bid-row" }, [
              input,
              el(
                "button",
                { class: "btn-accent-pill", disabled: busy, onclick: () => act(() => api.bidUsername(a.id, Number(input.value)), "Ставка принята") },
                "Поставить"
              ),
            ]);
          })()
        : null,
      data.isAdmin && a.status === "open"
        ? el("div", { class: "admin-label-grid" }, [
            el("button", { class: "admin-label-btn", disabled: busy, onclick: () => act(() => api.closeUsernameAuction(a.id), "Аукцион завершён") }, "Завершить сейчас"),
            el(
              "button",
              {
                class: "admin-label-btn",
                disabled: busy,
                onclick: () => {
                  if (confirm(`Отменить аукцион @${a.username}? Ставки аннулируются, звёзды не списывались.`)) {
                    act(() => api.deleteUsernameAuction(a.id), "Аукцион отменён");
                  }
                },
              },
              "Отменить"
            ),
          ])
        : null,
    ].filter(Boolean));
  }

  function render() {
    if (!data) {
      mount(root, pageWrap("Аукцион юзернеймов", null, [el("p", { class: error ? "login-error" : "settings-toggle-hint" }, error ?? "Загружаем…")]));
      return;
    }

    const nameInput = el("input", { class: "settings-input mono", placeholder: "юзернейм" });
    const priceInput = el("input", { class: "settings-input mono", type: "number", min: "0", value: "100", placeholder: "Старт, ⭐" });
    const hoursInput = el("input", { class: "settings-input mono", type: "number", min: "1", value: "24", placeholder: "Часов" });
    const grantUser = el("input", { class: "settings-input mono", type: "tel", placeholder: "+7 999 123 45 67" });
    const grantName = el("input", { class: "settings-input mono", placeholder: "юзернейм" });

    const open = data.auctions.filter((a) => a.status === "open");
    const done = data.auctions.filter((a) => a.status !== "open");

    mount(
      root,
      pageWrap("Аукцион юзернеймов", "Короткие @имена — от 3 символов", [
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("p", { class: "settings-toggle-hint" }, `На балансе: ${data.balance} ⭐. Звёзды списываются только у победителя и только в момент завершения — до этого баланс не блокируется.`),

        data.isAdmin
          ? section("Выставить юзернейм", [
              el("div", { class: "gift-create-grid" }, [nameInput, priceInput, hoursInput]),
              el(
                "button",
                {
                  class: "btn-accent",
                  disabled: busy,
                  onclick: () =>
                    act(
                      () => api.createUsernameAuction(nameInput.value.trim(), Number(priceInput.value), Number(hoursInput.value)),
                      "Аукцион создан"
                    ),
                },
                "Выставить"
              ),
            ])
          : null,

        data.isAdmin
          ? section("Выдать юзернейм напрямую", [
              el("p", { class: "settings-toggle-hint" }, "Без аукциона — например, за заслуги или по договорённости. Найдём по номеру телефона."),
              el("div", { class: "contacts-phone-row" }, [grantUser, grantName]),
              el(
                "button",
                {
                  class: "btn-accent",
                  disabled: busy,
                  onclick: () => act(() => api.grantUsername(grantUser.value.trim(), grantName.value.trim()), "Юзернейм выдан"),
                },
                "Выдать"
              ),
            ])
          : null,

        el("p", { class: "settings-section-title" }, `Идут торги (${open.length})`),
        open.length ? el("div", { class: "auction-list" }, open.map(auctionCard)) : el("p", { class: "empty-hint" }, "Сейчас ничего не разыгрывается"),

        done.length ? el("p", { class: "settings-section-title" }, "Завершённые") : null,
        done.length ? el("div", { class: "auction-list" }, done.map(auctionCard)) : null,
      ].filter(Boolean))
    );
  }

  render();
  load();
}

async function renderGiftShop(root) {
  let data = null;
  let error = null;
  let busyId = null;
  let notice = null;
  const draft = { emoji: "", name: "", priceStars: "", supply: "", exclusive: true, forever: true };

  async function load() {
    try {
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось загрузить каталог";
    }
    render();
  }

  const fmt = (n) => Number(n).toLocaleString("ru-RU");

  async function saveSupply(gift, value) {
    busyId = gift.id;
    error = null;
    notice = null;
    render();
    try {
      await api.adminSetGiftSupply(gift.id, Number(value));
      notice = `Тираж «${gift.name}» — теперь ${fmt(value)} шт.`;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось изменить тираж";
    } finally {
      busyId = null;
      render();
    }
  }

  async function createGift() {
    error = null;
    notice = null;
    try {
      const { gift } = await api.adminCreateGift({
        emoji: draft.emoji,
        name: draft.name,
        priceStars: Number(draft.priceStars),
        premiumDays: draft.forever ? null : 0,
        supply: draft.exclusive ? Number(draft.supply) : null,
        exclusive: draft.exclusive,
      });
      notice = `Выпущен подарок ${gift.emoji} «${gift.name}»`;
      draft.emoji = "";
      draft.name = "";
      draft.priceStars = "";
      draft.supply = "";
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось создать подарок";
    }
    render();
  }

  async function removeGift(gift) {
    error = null;
    notice = null;
    try {
      await api.adminDeleteGift(gift.id);
      notice = `Подарок «${gift.name}» удалён`;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось удалить";
    }
    render();
  }

  function supplyRow(gift) {
    // Uncontrolled input, read on submit: re-rendering on every keystroke would
    // take the focus with it (the same trap as the contacts search).
    const input = el("input", {
      class: "settings-input gift-supply-input mono",
      type: "number",
      min: String(data.supplyMin),
      max: String(data.supplyMax),
      step: "1",
      value: String(gift.supply),
    });
    return el("div", { class: "gift-admin-row" }, [
      el("span", { class: "gift-admin-emoji" }, gift.emoji),
      el("div", { class: "gift-admin-body" }, [
        el("p", { class: "gift-admin-name" }, [gift.name, gift.custom ? el("span", { class: "gift-admin-tag" }, "свой") : null]),
        el("p", { class: "gift-admin-sub mono" }, `⭐ ${fmt(gift.priceStars)} · выпущено ${fmt(gift.issued ?? 0)} · осталось ${fmt(gift.remaining ?? 0)}`),
      ]),
      input,
      el(
        "button",
        { class: "btn-accent-pill", disabled: busyId === gift.id, onclick: () => saveSupply(gift, input.value) },
        busyId === gift.id ? "…" : "Сохранить"
      ),
      gift.custom && (gift.issued ?? 0) === 0
        ? el("button", { class: "icon-btn", title: "Удалить", html: iconSvg("Trash", 15), onclick: () => removeGift(gift) })
        : null,
    ]);
  }

  function render() {
    if (error && !data) {
      mount(root, pageWrap("Каталог подарков", null, [el("p", { class: "login-error" }, error)]));
      return;
    }
    if (!data) {
      mount(root, pageWrap("Каталог подарков", null, [el("p", { class: "settings-toggle-hint" }, "Загружаем…")]));
      return;
    }

    const limited = data.gifts.filter((g) => g.supply);
    const emojiInput = el("input", { class: "settings-input gift-emoji-input", placeholder: "🎁", value: draft.emoji, oninput: (e) => (draft.emoji = e.target.value) });
    const nameInput = el("input", { class: "settings-input", placeholder: "Название", value: draft.name, oninput: (e) => (draft.name = e.target.value) });
    const priceInput = el("input", { class: "settings-input mono", type: "number", min: "1", placeholder: "Цена, ⭐", value: draft.priceStars, oninput: (e) => (draft.priceStars = e.target.value) });
    const supplyInput = el("input", {
      class: "settings-input mono",
      type: "number",
      min: String(data.supplyMin),
      max: String(data.supplyMax),
      placeholder: `Тираж ${fmt(data.supplyMin)}–${fmt(data.supplyMax)}`,
      value: draft.supply,
      oninput: (e) => (draft.supply = e.target.value),
    });

    mount(
      root,
      pageWrap("Каталог подарков", "Тиражи эксклюзивов и выпуск новых подарков", [
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,

        section("Выпустить новый подарок", [
          el("div", { class: "gift-create-grid" }, [emojiInput, nameInput, priceInput, supplyInput]),
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Эксклюзив с тиражом"),
              el("p", { class: "settings-toggle-hint" }, `Каждая копия получает свой номер. Тираж — от ${fmt(data.supplyMin)} до ${fmt(data.supplyMax)}.`),
            ]),
            Toggle(draft.exclusive, (v) => {
              draft.exclusive = v;
              render();
            }),
          ]),
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Даёт Premium навсегда"),
              el("p", { class: "settings-toggle-hint" }, "Иначе подарок чисто декоративный"),
            ]),
            Toggle(draft.forever, (v) => {
              draft.forever = v;
              render();
            }),
          ]),
          el("button", { class: "btn-accent", onclick: createGift }, "Выпустить"),
        ]),

        section(`Тиражи (${limited.length})`, limited.length ? limited.map(supplyRow) : [el("p", { class: "moderation-empty" }, "Ограниченных подарков нет")]),
      ])
    );
  }

  render();
  await load();
}

async function renderLegal(root) {
  let target = null; // resolved user, or null until looked up
  let lookupError = null;
  let exportError = null;
  let busy = false;
  let lastExport = null; // { exportId, at } confirmation after a run
  let log = [];

  const queryInput = el("input", { class: "settings-input", placeholder: "@username, +7… или id пользователя" });
  const reasonInput = el("input", { class: "settings-input", placeholder: "Основание: № дела / реквизиты постановления" });

  try {
    ({ exports: log } = await api.adminListExports());
  } catch (err) {
    // Non-admin never reaches this renderer (nav hides it), but a 403 here
    // would just mean an empty log, not a broken page.
    log = [];
  }

  async function lookup() {
    lookupError = null;
    target = null;
    const q = queryInput.value.trim();
    if (!q) return;
    busy = true;
    render();
    try {
      ({ user: target } = await api.adminLookupUser(q));
    } catch (err) {
      lookupError = err.message || "Пользователь не найден";
    } finally {
      busy = false;
      render();
    }
  }

  async function runExport() {
    exportError = null;
    if (!target) {
      exportError = "Сначала найдите пользователя";
      return render();
    }
    const reason = reasonInput.value.trim();
    if (!reason) {
      exportError = "Укажите основание — оно записывается в журнал";
      return render();
    }
    busy = true;
    render();
    try {
      const { exportId, data } = await api.adminExportUser(target.id, reason);
      // Turn the assembled JSON into a downloaded file entirely client-side
      // (a Blob + object URL) — nothing extra to store on the server, and
      // the file never lingers anywhere but the admin's own machine.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: `export_${target.username || target.id}_${exportId}.json` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      lastExport = { exportId, at: new Date().toISOString(), messageCount: data.stats.messageCount };
      ({ exports: log } = await api.adminListExports());
    } catch (err) {
      exportError = err.message || "Не удалось выгрузить";
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    mount(
      root,
      pageWrap("Запросы органов", "Адресная выгрузка хранимых данных одного пользователя по законному запросу", [
        section(null, [
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Выгружается только то, что хранится на сервере. Каждая выгрузка фиксируется в журнале ниже."
          ),
        ]),
        section("Найти пользователя", [
          queryInput,
          el("button", { class: "btn-accent", disabled: busy, onclick: lookup }, "Найти"),
          lookupError ? el("p", { class: "login-error" }, lookupError) : null,
          target
            ? el("div", { class: "settings-toggle-row no-divider" }, [
                el("span", { class: "settings-toggle-title" }, `${target.name}${target.username ? ` · @${target.username}` : ""}`),
                el("span", { class: "mono settings-toggle-hint" }, target.phone || target.id),
              ])
            : null,
        ]),
        target
          ? section("Выгрузка", [
              reasonInput,
              exportError ? el("p", { class: "login-error" }, exportError) : null,
              el("button", { class: "btn-accent", disabled: busy, onclick: runExport }, busy ? "Готовим файл…" : "Выгрузить файл переписки"),
              lastExport
                ? el("p", { class: "login-hint" }, `✅ Файл выгружен (${lastExport.messageCount} сообщений). Запись в журнале: ${lastExport.exportId}.`)
                : null,
            ])
          : null,
        section("Журнал выгрузок", [
          log.length === 0
            ? el("p", { class: "settings-toggle-hint" }, "Выгрузок ещё не было.")
            : el(
                "div",
                { class: "legal-log" },
                log.map((e) =>
                  el("div", { class: "legal-log-row" }, [
                    el("div", { class: "legal-log-main" }, [
                      el("span", { class: "legal-log-target" }, `${e.target.name}${e.target.username ? ` @${e.target.username}` : ""}`),
                      el("span", { class: "legal-log-reason" }, e.reason),
                    ]),
                    el("div", { class: "legal-log-meta mono" }, [
                      `${new Date(e.at).toLocaleString("ru-RU")} · ${e.messageCount} сообщ. · ${e.admin.name}`,
                    ]),
                  ])
                )
              ),
        ]),
      ])
    );
  }
  render();
}

async function renderDonations(root) {
  const params = new URLSearchParams(window.location.search);
  let banner = params.get("connected") ? "connected" : params.get("error") ? "error" : null;
  if (banner) window.history.replaceState(null, "", "/settings/donations");

  let status = null;
  let loadError = null;
  try {
    status = await api.getDonationAlertsStatus();
  } catch (err) {
    loadError = err.message;
  }

  mount(
    root,
    pageWrap("DonationAlerts", "Реальная автоматическая оплата Premium, рекламы и подарков вместо ручного подтверждения", [
      banner === "connected" ? el("p", { class: "login-hint" }, "✅ DonationAlerts подключён.") : null,
      banner === "error" ? el("p", { class: "login-error" }, "Не удалось подключить DonationAlerts — попробуйте ещё раз.") : null,
      loadError ? el("p", { class: "login-error" }, loadError) : null,
      status
        ? section(null, [
            !status.configured
              ? el("p", { class: "settings-toggle-hint" }, "На сервере не заданы DONATIONALERTS_CLIENT_ID / DONATIONALERTS_CLIENT_SECRET / DONATIONALERTS_REDIRECT_URI — без них подключение недоступно.")
              : status.connected
                ? el("p", { class: "settings-toggle-title" }, `Подключено${status.username ? ` как @${status.username}` : ""} ✅`)
                : el("a", { class: "btn-accent donation-link-btn", href: "/api/donation-alerts/connect" }, "Подключить DonationAlerts"),
          ])
        : null,
    ])
  );
}
