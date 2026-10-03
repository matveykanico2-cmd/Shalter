import { askText } from "../../components/confirmDialog.js";
import { askConfirm } from "../../components/confirmDialog.js";
import { showToast } from "../../components/toast.js";
import { openLimitPopup } from "../../components/limitPopup.js";
import { openPremiumFeatures } from "../../components/premiumFeatures.js";
import { el, mount, clear } from "../../lib/dom.js";
import { clearCache } from "../../lib/localCache.js";
import { iconSvg } from "../../icons.js";
import { Avatar, videoAvatarUrl } from "../../components/avatar.js";
import { api } from "../../api.js";
import { getState, setState, updateSelf, subscribe } from "../../state.js";
import { navigate } from "../../router.js";
import { fileToImageDataUrl, fileToDataUrl } from "../../lib/image.js";
import { ImageAttachment, VideoAttachment, FileAttachment } from "../../components/attachments.js";
import { requestPushPermission, pushDiagnostics, resubscribePush, iosNeedsHomeScreen } from "../../lib/push.js";
import { openCreateBotDialog } from "../../components/createBotDialog.js";
import { openBotTokenDialog } from "../../components/botTokenDialog.js";
import { openOAuthSecretDialog } from "../../components/oauthSecretDialog.js";
import { openBotCodeDialog } from "../../components/botCodeDialog.js";
import { openEditBotDialog } from "../../components/editBotDialog.js";
import { PhoneField } from "../../components/phoneField.js";
import { DateField } from "../../components/dateField.js";
import { hasPasscode } from "../../lib/passcodeLock.js";
import { hasBiometric, enableBiometric, removeBiometric, isBiometricAvailable } from "../../lib/biometricLock.js";
import { openSetPasscodeDialog, openRemovePasscodeDialog } from "../../components/passcodeDialog.js";
import { openTwoFactorSetupDialog, openTwoFactorDisableDialog } from "../../components/twoFactorDialog.js";
import { passkeysSupported, registerPasskey, passkeyErrorText } from "../../lib/passkey.js";
import { openChangePasswordDialog, openChangeEmailDialog } from "../../components/credentialsDialog.js";
import { VerifiedBadge } from "../../components/verifiedBadge.js";
import { ProfileStatusBadge } from "../../components/profileStatusBadge.js";
import { StarsPanel } from "../../components/starsDialog.js";
import { openGiftShopDialog } from "../../components/giftShopDialog.js";
import { openAvatarViewer } from "../../components/avatarViewer.js";
import { openProfileStatusDialog } from "../../components/profileStatusDialog.js";
import { Toggle } from "../../components/toggle.js";
import { isSpeechSupported } from "../../lib/speech.js";
import { openProfileQrDialog } from "../../components/profileQrDialog.js";
import { handlePurchaseResponse } from "../../lib/purchase.js";
import {
  DAY_KEYS as BUSINESS_DAY_KEYS,
  DAY_LABELS,
  browserTimeZone,
  timeZoneList,
  isAllDay,
  formatDayHours,
  businessStatus,
  formatStatus,
} from "../../lib/businessHours.js";
import { uploadFile } from "../../lib/upload.js";
import { renderGiftArt } from "../../lib/giftTraits.js";
import { openAnimatorEditor } from "../../components/animatorEditor.js";
import { renderCustomScene } from "../../lib/customScene.js";
import { timeAgo, plural } from "../../lib/presence.js";
import { applyAccentSetting, isThemeAccent } from "../../lib/accent.js";
import { startRecording, isRecordingSupported } from "../../lib/recorder.js";
import { checkSize } from "../../lib/uploadLimits.js";
import { WALLPAPER_GROUPS } from "../../lib/wallpapers.js";
import { openAdminUserPanel } from "../../components/adminUserPanel.js";
import { PremiumStar } from "../../components/premiumStar.js";
import { AdCabinet } from "../../components/adCabinet.js";
import { AdReviewQueue } from "../../components/adModeration.js";
import { safetyLabelInfo } from "../../lib/safetyLabels.js";
import { openDropdownMenu } from "../../components/dropdownMenu.js";
import { openPrivacyExceptionsDialog } from "../../components/privacyExceptionsDialog.js";
import { openProfileDialog } from "../../components/profileDialog.js";
import { openCheckboxDialog, openChoiceDialog } from "../../components/confirmDialog.js";

const UNSUPPORTED_LANGUAGE_NOTE = "Украинский язык не поддерживается в нашем мессенджере.";

const SECTIONS = [
  { id: "profile", label: "Изменить профиль", icon: "Edit", color: "blue" },
  { id: "notifications", label: "Уведомления", icon: "Bell", color: "red", group: "main" },
  { id: "holidays", label: "Праздники", icon: "Gift", color: "orange", group: "main" },
  { id: "data", label: "Данные и память", icon: "Download", color: "green", group: "main" },
  { id: "privacy", label: "Конфиденциальность", icon: "Lock", color: "grey", group: "main" },
  { id: "appearance", label: "Внешний вид", icon: "Palette", color: "orange", group: "main" },
  { id: "folders", label: "Папки с чатами", icon: "Folder", color: "blue", group: "main" },
  { id: "devices", label: "Устройства", icon: "Monitor", color: "blue", group: "main" },
  { id: "accounts", label: "Аккаунты", icon: "Accounts", color: "purple", group: "main" },
  { id: "shortcuts", label: "Горячие клавиши", icon: "Keyboard", color: "orange", group: "main" },
  { id: "premium", label: "Shalter Premium", icon: "Star", color: "premium", group: "extra" },
  { id: "business", label: "Shalter для бизнеса", icon: "Bag", color: "green", group: "extra" },
  { id: "partners", label: "Партнёрка", icon: "Users", color: "purple", group: "extra" },
  { id: "oauth", label: "Войти через Shalter", icon: "Lock", color: "blue", group: "extra" },
  { id: "stars", label: "Звёзды", icon: "Zap", color: "orange", group: "extra" },
  { id: "usernames", label: "Аукцион юзернеймов", icon: "Globe", color: "blue", group: "extra" },
  { id: "ads", label: "Реклама", icon: "BarChart", color: "pink", group: "extra" },
  { id: "bots", label: "Боты", icon: "Code", color: "green", group: "extra" },
  { id: "about", label: "О приложении", icon: "Info", color: "grey", group: "extra" },
  { id: "moderation", label: "Модерация", icon: "Shield", color: "red", group: "admin", adminOnly: true },
  { id: "server", label: "Состояние сервера", icon: "BarChart", color: "purple", group: "admin", adminOnly: true },
  { id: "giftshop", label: "Каталог подарков", icon: "Gift", color: "orange", group: "admin", adminOnly: true },
  { id: "emojicatalog", label: "Эмодзи", icon: "Smile", color: "orange", group: "admin", adminOnly: true },
  { id: "donations", label: "Донаты", icon: "Zap", color: "pink", group: "admin", adminOnly: true },
  { id: "pricing", label: "Цены и тарифы", icon: "Star", color: "green", group: "admin", adminOnly: true },
  { id: "legal", label: "Запросы органов", icon: "Shield", color: "grey", group: "admin", adminOnly: true },
];

let panelTitleEl = null;
function setPanelTitle(title) {
  if (panelTitleEl && title) panelTitleEl.textContent = title;
}

function menuRow({ icon, label, value, href, onClick, danger }) {
  const body = [
    icon ? el("span", { class: "settings-row-icon", html: iconSvg(icon, 22) }) : null,
    el("span", { class: "settings-row-label" }, label),
    value != null && value !== "" ? el("span", { class: "settings-row-value" }, String(value)) : null,
  ];
  const cls = `settings-row${danger ? " danger" : ""}`;
  return href
    ? el("a", { class: cls, href, "data-route": "1" }, body)
    : el("button", { class: cls, onclick: onClick }, body);
}

function copyRow({ icon, value, label }) {
  const row = el("button", { class: "settings-row settings-row-copy" }, [
    el("span", { class: "settings-row-icon", html: iconSvg(icon, 22) }),
    el("span", { class: "settings-row-stack" }, [
      el("span", { class: "settings-row-value-big" }, value),
      el("span", { class: "settings-row-sublabel" }, label),
    ]),
  ]);
  row.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      row.classList.add("copied");
      setTimeout(() => row.classList.remove("copied"), 1200);
    } catch {
    }
  });
  return row;
}

export async function SettingsView(root, page) {
  const section = page ?? "";
  const me = getState().user;
  const known = SECTIONS.find((s) => s.id === section);
  if (known?.adminOnly && !me.isDeveloper && !me.adminSections?.includes(known.id)) {
    navigate("/settings", { replace: true });
    return;
  }

  const backTo = section === "" ? "/" : "/settings";
  panelTitleEl = el("h2", { class: "settings-header-title" }, section === "" ? "Настройки" : known?.label ?? "Настройки");

  const header = el("div", { class: "settings-header" }, [
    el("button", {
      class: "settings-header-back",
      title: "Назад",
      html: iconSvg("ChevronLeft", 22),
      onclick: () => navigate(backTo),
    }),
    panelTitleEl,
    section === ""
      ? el("div", { class: "settings-header-actions" }, [
          me.username
            ? el("button", {
                class: "icon-btn",
                title: "QR-код профиля",
                html: iconSvg("Qrcode", 19),
                onclick: () => openProfileQrDialog(me),
              })
            : null,
          el("button", {
            class: "icon-btn",
            title: "Изменить профиль",
            html: iconSvg("Edit", 19),
            onclick: () => navigate("/settings/profile"),
          }),
          el("button", {
            class: "icon-btn",
            title: "Ещё",
            html: iconSvg("More", 19),
            onclick: (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openDropdownMenu({ x: r.left - 140, y: r.bottom + 6 }, [
                { icon: "Edit", label: "Изменить профиль", onClick: () => navigate("/settings/profile") },
                { icon: "Accounts", label: "Аккаунты и выход", onClick: () => navigate("/settings/accounts") },
                { icon: "Info", label: "Поддержка — Hugo", onClick: openSupport },
              ]);
            },
          }),
        ])
      : null,
  ]);

  const contentSlot = el("div", { class: "settings-content" });
  mount(root, el("div", { class: "settings-panel" }, [header, contentSlot]));

  const renderers = {
    "": renderMenu,
    profile: renderProfile,
    premium: renderPremium,
    business: renderBusiness,
    partners: renderPartners,
    oauth: renderOAuthApps,
    ads: renderAds,
    bots: renderBots,
    about: renderAbout,
    appearance: renderAppearance,
    notifications: renderNotifications,
    holidays: renderHolidays,
    privacy: renderPrivacy,
    devices: renderDevices,
    accounts: renderAccounts,
    folders: renderFolders,
    data: renderData,
    shortcuts: renderShortcuts,
    moderation: renderModeration,
    server: renderServer,
    donations: renderDonations,
    pricing: renderPricing,
    legal: renderLegal,
    stars: renderStars,
    giftshop: renderGiftShop,
    emojicatalog: renderEmojiCatalog,
    usernames: renderUsernames,
  };
  await (renderers[section] ?? renderMenu)(contentSlot);

  if (section === "") {
    root._cleanup = subscribe(() => renderMenu(contentSlot));
  }
}

async function openSupport() {
  try {
    const { chatId } = await api.openSupportChat();
    navigate(`/chat/${chatId}`);
  } catch (err) {
    alert(err.message || "Не удалось открыть поддержку");
  }
}

let sessionsCount = null;

function renderMenu(root) {
  const me = getState().user;
  const accounts = getState().accounts ?? [];
  const groupOf = (g) =>
    SECTIONS.filter((s) => s.group === g && (!s.adminOnly || me.isDeveloper || me.adminSections?.includes(s.id)));

  if (sessionsCount == null) {
    sessionsCount = "";
    api.listSessions().then((r) => {
      sessionsCount = String(r.sessions?.length ?? "");
      if (root.isConnected) renderMenu(root);
    }, () => {});
  }

  const rightFor = (s) => {
    if (s.id === "accounts" && accounts.length > 1) return String(accounts.length);
    if (s.id === "devices" && sessionsCount) return sessionsCount;
    if (s.id === "stars" && me.starsBalance) return String(me.starsBalance);
    return null;
  };

  const rowFor = (s) =>
    twRow({ icon: s.icon, color: s.color, title: s.label, titleRight: rightFor(s), href: `/settings/${s.id}` });

  const admin = groupOf("admin");

  mount(
    root,
    el("div", { class: "settings-page tw-page tw-settings-menu" }, [
      el("div", { class: "tw-profile-hero" }, [
        el("button", {
          class: "tw-profile-hero-avatar",
          onclick: () => (me.avatarImage ? openAvatarViewer(me) : navigate("/settings/profile")),
        }, [
          Avatar({ name: me.name || "?", color: me.avatarColor, image: me.avatarImage, video: videoAvatarUrl(me), size: 120, isPremium: me.isPremium, isDeveloper: me.isDeveloper, orbit: true }),
        ]),
        el("p", { class: "tw-profile-hero-name" }, [me.name || "Профиль", me.isPremium ? PremiumStar({ size: 18, seed: me.id, title: "Shalter Premium" }) : null, ProfileStatusBadge(me, 18)]),
        el("p", { class: "tw-profile-hero-status" }, "в сети"),
      ]),
      twSection(null, [
        me.phone ? twRow({ icon: "Phone", title: me.phone, subtitle: "Телефон", onClick: () => copyText(me.phone, "Номер скопирован") }) : null,
        me.username
          ? twRow({ icon: "At", title: `@${me.username}`, subtitle: "Имя пользователя", onClick: () => copyText(`@${me.username}`, "Имя пользователя скопировано") })
          : twRow({ icon: "At", title: "Добавить имя пользователя", subtitle: "Имя пользователя", href: "/settings/profile" }),
        me.bio ? twRow({ icon: "Info", title: me.bio, subtitle: "О себе", href: "/settings/profile" }) : null,
        twRow({ icon: "User", title: "Мой профиль", onClick: () => openProfileDialog(me.id) }),
      ]),
      twSection(null, groupOf("main").map(rowFor)),
      twSection(null, groupOf("extra").map(rowFor)),
      admin.length ? twSection("Администрирование", admin.map(rowFor)) : null,
      twSection(null, [
        twRow({ icon: "MessageSquare", color: "blue", title: "Поддержка — Hugo", onClick: openSupport }),
        el("a", { class: "tw-row clickable", href: "/download" }, [
          twRowIcon("Download", "green"),
          el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, "Скачать приложение")]),
        ]),
      ]),
    ])
  );
}

function copyText(text, toast) {
  navigator.clipboard?.writeText(text).then(() => showToast(toast), () => {});
}


function pageWrap(title, subtitle, children) {
  setPanelTitle(title);
  return el("div", { class: "settings-page" }, [
    subtitle ? el("p", { class: "settings-page-subtitle" }, subtitle) : null,
    ...children,
  ]);
}

function section(title, children) {
  return el("div", { class: "settings-section-group" }, [
    title ? el("p", { class: "settings-section-title" }, title) : null,
    el("div", { class: "settings-section" }, children),
  ]);
}

async function renderProfile(root) {
  const me = getState().user;
  let lastName = me.lastName ?? "";
  let firstName = lastName && me.name.endsWith(` ${lastName}`) ? me.name.slice(0, -(lastName.length + 1)) : me.name;
  let name = me.name;
  let username = me.username;
  let phone = me.phone ?? "";
  let bio = me.bio;
  let birthday = me.birthday ?? "";
  let birthdayError = null;
  let birthdayField = null;
  let avatarImage = me.avatarImage;
  let avatarImages = me.avatarImages ?? [];
  let avatarColor = me.avatarColor;
  const AVATAR_COLORS = ["#2E56D9", "#7c6fd6", "#d9822e", "#2f9e5a", "#d94a5a", "#e0a423", "#1c9bd9", "#8a5cf6", "#e0507a", "#3aa6a0"];
  async function saveAvatarColor(c) {
    avatarColor = c;
    render();
    try {
      await api.updateProfile(me.id, { avatarColor: c });
      updateSelf({ avatarColor: c });
    } catch {
    }
  }
  let statusIcon = me.statusIcon;
  const bioCounter = el("span", { class: "settings-toggle-hint settings-bio-counter" }, String(300 - (me.bio ?? "").length));
  let phoneField = null;
  let saved = false;
  let profileError = null;
  let profileTrack = me.profileTrack ?? null;
  let trackBusy = false;
  let trackError = null;

  const trackFileInput = el("input", {
    type: "file",
    accept: "audio/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      trackError = null;
      trackBusy = true;
      render();
      try {
        const uploaded = await uploadFile(file, "profile-track");
        const { user } = await api.setProfileTrack(uploaded);
        profileTrack = user.profileTrack;
        updateSelf({ profileTrack });
      } catch (err) {
        trackError = err.message || "Не удалось загрузить трек";
      } finally {
        trackBusy = false;
        render();
      }
    },
  });

  async function removeTrack() {
    trackBusy = true;
    render();
    try {
      const { user } = await api.clearProfileTrack();
      profileTrack = user.profileTrack;
      updateSelf({ profileTrack });
    } catch (err) {
      trackError = err.message || "Не удалось убрать трек";
    } finally {
      trackBusy = false;
      render();
    }
  }

  function render() {
    bioCounter.textContent = String(300 - (bio ?? "").length);
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
        Avatar({ name: name || "?", color: avatarColor, image: avatarImage, video: videoAvatarUrl({ avatarImages }), size: 120, isPremium: me.isPremium, isDeveloper: me.isDeveloper, orbit: true }),
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
              me.isPremium ? PremiumStar({ size: 18, seed: me.id, title: "Shalter Premium" }) : null,
              ProfileStatusBadge({ statusIcon, name: name || me.name }, 18),
            ]),
            el("p", { class: "mono settings-profile-sub" }, me.phone || me.email),
          ]),
        ]),
        !avatarImage
          ? section("Цвет аватара", [
              el("p", { class: "settings-toggle-hint" }, "Фон кружка с инициалами, пока не задано фото профиля"),
              el(
                "div",
                { class: "avatar-color-grid" },
                AVATAR_COLORS.map((c) =>
                  el("button", {
                    class: `avatar-color-swatch${avatarColor === c ? " active" : ""}`,
                    style: `background:${c}`,
                    title: "Выбрать цвет",
                    onclick: () => saveAvatarColor(c),
                  })
                )
              ),
            ])
          : null,
        section(null, [
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Имя"),
            el("input", { class: "settings-input", value: firstName, maxLength: 64, oninput: (e) => (firstName = e.target.value) }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Фамилия"),
            el("input", { class: "settings-input", value: lastName, placeholder: "необязательно", maxLength: 60, oninput: (e) => (lastName = e.target.value) }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Юзернейм"),
            el("input", {
              class: "settings-input",
              value: username,
              maxLength: 32,
              oninput: (e) => {
                const clean = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                if (clean !== e.target.value) e.target.value = clean;
                username = clean;
              },
            }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Телефон"),
            (phoneField ??= PhoneField({ value: phone, onChange: (v) => (phone = v) })).el,
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "О себе"),
            el("textarea", {
              class: "settings-input",
              rows: 3,
              value: bio ?? "",
              maxLength: 300,
              oninput: (e) => {
                bio = e.target.value;
                bioCounter.textContent = String(300 - bio.length);
              },
            }),
            bioCounter,
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-field-label" }, "Дата рождения"),
            (birthdayField ??= DateField({
              value: birthday,
              onChange: (iso, err) => {
                birthday = iso;
                birthdayError = err;
              },
            })).el,
            birthdayError
              ? el("span", { class: "login-error" }, birthdayError)
              : el("span", { class: "settings-toggle-hint" }, "Например: 25.12.1990"),
          ]),
        ]),
        section("Статус", [
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, "Значок рядом с именем"),
              el("p", { class: "settings-toggle-hint" }, me.isPremium ? "До 5 своих статусов — свой или из готовых." : "1 слот — с Premium будет 5."),
            ]),
            el(
              "button",
              {
                class: "profile-action-btn",
                onclick: () =>
                  openProfileStatusDialog(() => {
                    statusIcon = getState().user?.statusIcon;
                    render();
                  }),
              },
              statusIcon ? "Изменить" : "Выбрать"
            ),
          ]),
        ]),
        section("Закреплённый трек", [
          el("div", { class: "settings-toggle-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, profileTrack ? profileTrack.name : "Ничего не закреплено"),
              el(
                "p",
                { class: "settings-toggle-hint" },
                "Свой аудиофайл на профиле — виден всем, кто его открывает. Один трек, до 5 ГБ."
              ),
            ]),
            el(
              "div",
              { style: "display:flex; gap:8px;" },
              [
                el(
                  "button",
                  { class: "profile-action-btn", disabled: trackBusy, onclick: () => trackFileInput.click() },
                  trackBusy ? "…" : profileTrack ? "Заменить" : "Загрузить"
                ),
                profileTrack
                  ? el("button", { class: "profile-action-btn danger", disabled: trackBusy, onclick: removeTrack }, "Убрать")
                  : null,
              ].filter(Boolean)
            ),
          ]),
          trackError ? el("p", { class: "login-error" }, trackError) : null,
          trackFileInput,
        ]),
        profileError ? el("p", { class: "login-error" }, profileError) : null,
        el(
          "button",
          {
            class: "btn-accent",
            onclick: async () => {
              profileError = null;
              const date = birthdayField ? birthdayField.read() : { iso: birthday, error: null };
              if (date.error) {
                profileError = `Дата рождения: ${date.error.toLowerCase()}`;
                birthdayError = date.error;
                return render();
              }
              birthday = date.iso;
              try {
                name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
                const { user } = await api.updateProfile(me.id, { name, lastName: lastName.trim(), username, phone, bio: bio ?? "", birthday });
                name = user.name;
                username = user.username;
                bio = user.bio ?? "";
                updateSelf({ name: user.name, lastName: user.lastName ?? "", username: user.username, phone: user.phone, bio: user.bio ?? "", birthday: user.birthday ?? "" });
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

const PREMIUM_COMPARE = [
  ["Платная личка незнакомцам", "⭐ звёздами", "Бесплатно"],
  ["Писать в «только контакты»", "—", "Да"],
  ["Звонки незнакомцам со включённой платой", "⭐ звёздами", "Бесплатно"],
  ["Пригласить в звонок по ссылке", "только участников", "Кого угодно"],
  ["Статусы профиля", "1", "до 5"],
  ["Значок и кольцо Premium", "—", "Да"],
  ["Эксклюзивные реакции 💎 👑 🚀 🥂 💯 🌟", "—", "Да"],
  ["Реакций на одно сообщение", "1", "до 3"],
  ["Папок с чатами", "10", "20"],
  ["Реклама в списке чатов", "есть", "нет"],
];

const PREMIUM_PERKS = [
  {
    icon: "Folder",
    title: "Удвоенные лимиты",
    desc: "До 20 папок с чатами вместо 10",
  },
  {
    icon: "BarChart",
    title: "Без рекламы",
    desc: "Спонсорские объявления в списке чатов и каналах больше не показываются",
  },
  {
    icon: "MessageSquare",
    title: "Пишите и звоните бесплатно",
    desc: "Платная личка и звонки незнакомцам не берут с вас звёзды, даже если у собеседника это включено",
  },
  {
    icon: "Lock",
    title: "Доступ в закрытую личку",
    desc: "Пишите даже тем, кто разрешил сообщения только от контактов",
  },
  {
    icon: "Video",
    title: "Ссылка на звонок для всех",
    desc: "Приглашайте в звонок кого угодно, не только участников чата",
  },
  {
    icon: "Smile",
    title: "До 5 статусов профиля",
    desc: "Готовых или своих — вместо одного на обычном аккаунте",
  },
  {
    icon: "Star",
    title: "Значок Premium",
    desc: "Звезда у имени и особое кольцо вокруг аватарки",
  },
  {
    icon: "Zap",
    title: "Эксклюзивные реакции",
    desc: "💎 👑 🚀 🥂 💯 🌟 — доступны в любом чате",
  },
  {
    icon: "CheckCheck",
    title: "До 3 реакций на сообщение",
    desc: "Обычный аккаунт может оставить только одну реакцию под сообщением — Premium ставит до трёх разом",
  },
];

// Цвета иконок возможностей — тот же градиент, что PREMIUM_FEATURES_COLORS в tweb.
const PREMIUM_FEATURE_COLORS = ["#ef6922", "#e74e33", "#db374b", "#bc4395", "#9b4fed", "#676bff", "#4492ff", "#41a6a5", "#3dbd4a"];

// Цвета иконок строк — ROW_ICON_COLORS из tweb (helpers/rowIconBackground.ts).
const TW_ROW_COLORS = {
  blue: "#2196F3",
  green: "#4CAF50",
  grey: "#78909C",
  orange: "#FB8C00",
  pink: "#E91E63",
  purple: "#7E57C2",
  red: "#F44336",
  premium: "var(--tw-premium-gradient)",
};

function twRowIcon(icon, color) {
  const bg = TW_ROW_COLORS[color] ?? color;
  return el("span", {
    class: "tw-row-media",
    style: color === "premium" ? `background-image: ${bg}` : `background-color: ${bg}`,
    html: iconSvg(icon, 20),
  });
}

function twSection(name, children, caption, nameRight) {
  return el("div", { class: "tw-section-group" }, [
    name ? el("p", { class: "tw-section-name" }, [el("span", {}, name), nameRight ?? null]) : null,
    el("div", { class: "tw-section" }, children),
    caption ? el("p", { class: "tw-section-caption" }, caption) : null,
  ]);
}

// Строка tweb (Row): иконка слева, заголовок, подзаголовок, справа значение или переключатель.
function twRow({ icon, color, title, titleRight, midtitle, subtitle, right, onClick, href, target, toggle, danger, accent, cls, disabled }) {
  const body = [
    icon ? (color ? twRowIcon(icon, color) : el("span", { class: "tw-row-icon", html: iconSvg(icon, 24) })) : null,
    el("span", { class: "tw-row-body" }, [
      el("span", { class: "tw-row-title" }, [
        el("span", { class: "tw-row-title-text" }, title),
        titleRight != null ? el("span", { class: "tw-row-title-right" }, titleRight) : null,
      ]),
      midtitle ? el("span", { class: "tw-row-midtitle" }, midtitle) : null,
      subtitle ? el("span", { class: "tw-row-subtitle" }, subtitle) : null,
    ]),
    toggle
      ? el("span", { class: "tw-row-right" }, Toggle(!!toggle.checked, () => {}, { disabled: toggle.disabled }))
      : right != null
        ? el("span", { class: "tw-row-right" }, right)
        : null,
  ];
  const classes = ["tw-row", cls, danger ? "danger" : null, accent ? "accent" : null];
  if (toggle) {
    return el("button", {
      type: "button",
      class: [...classes, "clickable"].filter(Boolean).join(" "),
      disabled: toggle.disabled || disabled,
      onclick: () => !toggle.disabled && toggle.onChange(!toggle.checked),
    }, body);
  }
  if (href) return el("a", { class: [...classes, "clickable"].filter(Boolean).join(" "), href, target, rel: target ? "noopener" : null, "data-route": target ? null : "1" }, body);
  if (onClick) return el("button", { type: "button", class: [...classes, "clickable"].filter(Boolean).join(" "), disabled, onclick: onClick }, body);
  return el("div", { class: classes.filter(Boolean).join(" ") }, body);
}

// Кнопка tweb btn-primary btn-transparent: строка с иконкой, синяя или красная.
function twButton({ icon, text, onClick, danger, disabled }) {
  return el("button", { type: "button", class: `tw-btn-row${danger ? " danger" : ""}`, disabled, onclick: onClick }, [
    icon ? el("span", { class: "tw-btn-row-icon", html: iconSvg(icon, 24) }) : null,
    el("span", {}, text),
  ]);
}

function premiumPlanRows(plans) {
  const rows = Object.entries(plans ?? {}).map(([id, plan]) => {
    const months = Math.max(1, Math.round(plan.days / 30));
    return { id, ...plan, months, perMonth: plan.priceRub / months };
  });
  const base = rows.reduce((min, r) => (min && min.months <= r.months ? min : r), null);
  for (const r of rows) {
    r.discount = base && r !== base ? Math.round((1 - r.perMonth / base.perMonth) * 100) : 0;
  }
  return rows;
}

async function renderPremium(root) {
  let info = await api.getPremiumInfo();
  const plans = premiumPlanRows(info.plans);
  let selectedPlan = plans.reduce((best, p) => (best && best.discount >= p.discount ? best : p), null)?.id ?? null;
  let buying = false;
  let buyError = null;

  async function buyPremium() {
    if (!selectedPlan) return;
    buying = true;
    buyError = null;
    render();
    try {
      const res = await api.requestPremium(selectedPlan);
      handlePurchaseResponse(res);
    } catch (err) {
      buyError = err.message;
    } finally {
      buying = false;
      render();
    }
  }

  async function buyWithStars() {
    if (!selectedPlan) return;
    buying = true;
    buyError = null;
    render();
    try {
      const res = await api.buyPremiumWithStars(selectedPlan);
      updateSelf({ isPremium: true });
      info = await api.getPremiumInfo();
      if (res?.chatId) navigate(`/chat/${res.chatId}`);
    } catch (err) {
      buyError = err.message;
    } finally {
      buying = false;
      render();
    }
  }

  function planRow(p) {
    const selected = p.id === selectedPlan;
    return el(
      "button",
      {
        type: "button",
        class: `tw-row clickable tw-plan${selected ? " selected" : ""}`,
        role: "radio",
        "aria-checked": selected ? "true" : "false",
        disabled: buying,
        onclick: () => {
          selectedPlan = p.id;
          render();
        },
      },
      [
        el("span", { class: "tw-radio" }),
        el("span", { class: "tw-row-body" }, [
          el("span", { class: "tw-row-title" }, [
            p.discount > 0 ? el("span", { class: "tw-plan-discount" }, `−${p.discount}%`) : null,
            p.label,
          ]),
          el("span", { class: "tw-row-subtitle" }, p.months > 1 ? `${p.priceRub} ₽ за ${p.label}` : "Оплата за месяц"),
        ]),
        el("span", { class: "tw-row-right" }, `${Math.round(p.perMonth)} ₽/мес`),
      ]
    );
  }

  function render() {
    const current = plans.find((p) => p.id === selectedPlan);
    const canBuy = !info.premiumForever && plans.length > 0;
    const notEnoughStars = current?.stars && (info.starsBalance ?? 0) < current.stars;
    setPanelTitle("Shalter Premium");
    mount(
      root,
      el("div", { class: "settings-page tw-page tw-premium" }, [
        el("div", { class: "tw-premium-hero" }, [
          el("img", { class: "tw-premium-star", src: "/img/tweb/premium-star.png", alt: "", width: 100, height: 100 }),
          el("h2", { class: "tw-media-title" }, info.isPremium ? "У вас Shalter Premium" : "Shalter Premium"),
          el(
            "p",
            { class: "tw-media-subtitle" },
            info.isPremium ? formatPremiumUntil(info) : "Больше возможностей, особый значок и эксклюзивные реакции — без ограничений обычного аккаунта."
          ),
        ]),
        canBuy
          ? twSection(
              info.isPremium ? "Продлить Premium" : "Выберите срок",
              [el("div", { role: "radiogroup" }, plans.map(planRow))],
              info.isPremium
                ? "Новый срок прибавится к текущей дате окончания. Автопродления нет — списаний без вашего ведома не будет."
                : "Оплата переводом администрации Shalter. Автопродления нет — срок просто закончится сам."
            )
          : null,
        buyError ? el("p", { class: "login-error tw-center" }, buyError) : null,
        twSection(
          "Что даёт Premium",
          PREMIUM_PERKS.map((p, i) =>
            twRow({
              icon: p.icon,
              color: PREMIUM_FEATURE_COLORS[i % PREMIUM_FEATURE_COLORS.length],
              title: p.title,
              subtitle: p.desc,
              onClick: () =>
                openPremiumFeatures({
                  features: PREMIUM_PERKS.map((f, j) => ({ ...f, color: PREMIUM_FEATURE_COLORS[j % PREMIUM_FEATURE_COLORS.length] })),
                  start: i,
                  isPremium: info.isPremium,
                  onSubscribe: () => root.querySelector(".tw-premium-confirm")?.click(),
                }),
            })
          )
        ),
        twSection("Сравнение", [
          el("div", { class: "premium-compare-card tw-compare" }, [
            el("div", { class: "premium-compare-head" }, [
              el("span", {}, "Возможность"),
              el("span", {}, "Бесплатно"),
              el("span", {}, "Premium"),
            ]),
            ...PREMIUM_COMPARE.map((row) =>
              el("div", { class: "premium-compare-row" }, [
                el("span", { class: "premium-compare-title" }, row[0]),
                el("span", { class: "premium-compare-free" }, row[1]),
                el("span", { class: "premium-compare-prem" }, row[2]),
              ])
            ),
          ]),
        ]),
        twSection(null, [
          twRow({ icon: "Link", title: "Публичная страница Premium", subtitle: "Откроется у любого, даже без аккаунта", href: "/premium", target: "_blank" }),
          twRow({ icon: "Gift", title: "Магазин подарков", subtitle: "Цены в звёздах, отправка мгновенная", onClick: () => openGiftShopDialog({}) }),
        ]),
        canBuy
          ? el("div", { class: "tw-premium-footer" }, [
              el(
                "button",
                { class: "tw-premium-confirm", disabled: buying || !current, onclick: buyPremium },
                buying ? "Открываем оплату…" : `${info.isPremium ? "Продлить" : "Подписаться"} за ${current?.priceRub ?? 0} ₽`
              ),
              current?.stars
                ? el(
                    "button",
                    { class: "tw-premium-stars", disabled: buying || notEnoughStars, onclick: buyWithStars },
                    notEnoughStars
                      ? `Не хватает звёзд: нужно ${current.stars} ⭐, у вас ${info.starsBalance ?? 0}`
                      : `Или за ${current.stars} ⭐ (у вас ${info.starsBalance})`
                  )
                : null,
            ])
          : null,
      ])
    );
  }
  render();
}

const BUSINESS_PERKS = [
  { icon: "Clock", color: "orange", title: "Часы работы", desc: "Покажите, когда вы на связи — и автоответ сам знает, когда включаться" },
  { icon: "MessageSquare", color: "blue", title: "Приветствие и автоответ", desc: "Новому клиенту — приветствие, вне часов работы — автоответ. От вашего имени, автоматически" },
  { icon: "Zap", color: "purple", title: "Быстрые ответы", desc: "Заготовленные шаблоны — не печатать одно и то же каждый раз" },
  { icon: "MapPin", color: "red", title: "Адрес на профиле", desc: "Покажите, где вас найти" },
];

async function renderBusiness(root) {
  let info = await api.getBusinessInfo();
  let buyingPlan = null;
  let buyError = null;
  let business = info.business;
  let addressDraft = info.businessAddress ?? "";
  let addressSaving = false;
  let newReplyShortcut = "";
  let newReplyText = "";
  let mediaBusyKey = null;
  let recordingKey = null;
  let recordMode = null;
  let recordingHandle = null;
  let recordPreviewEl = null;

  const plans = premiumPlanRows(info.plans);
  let selectedPlan = plans.reduce((best, p) => (best && best.discount >= p.discount ? best : p), null)?.id ?? null;

  function daysLeft() {
    if (!info.businessUntil) return 0;
    return Math.max(0, Math.ceil((new Date(info.businessUntil) - Date.now()) / 86400000));
  }

  function businessHero() {
    const active = info.isBusiness;
    const left = daysLeft();
    const maxDays = Math.max(365, ...plans.map((p) => p.days));
    const soon = active && !info.businessForever && left <= 7;
    return el("div", { class: "tw-media-header tw-business-hero" }, [
      el("span", { class: "tw-session-hero-icon", style: `background-color: ${TW_ROW_COLORS.green}`, html: iconSvg("Bag", 52) }),
      el("h2", { class: "tw-media-title" }, active ? "У вас Shalter для бизнеса" : "Shalter для бизнеса"),
      el(
        "p",
        { class: "tw-media-subtitle" },
        active
          ? info.businessForever
            ? "Подписка активна навсегда."
            : `Активна до ${new Date(info.businessUntil).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}.`
          : "Превратите аккаунт в витрину: часы работы, автоответы и адрес прямо в профиле."
      ),
      active && !info.businessForever
        ? el("div", { class: "tw-business-meter" }, [
            el("div", { class: "tw-business-meter-row" }, [
              el("span", {}, soon ? "Скоро закончится" : "Осталось"),
              el("span", {}, `${left} ${plural(left, "день", "дня", "дней")}`),
            ]),
            el("div", { class: `tw-business-bar${soon ? " warn" : ""}` }, [
              el("span", { style: `width: ${Math.min(100, Math.max(3, (left / maxDays) * 100))}%` }),
            ]),
          ])
        : null,
    ]);
  }

  function businessPlans() {
    const current = plans.find((p) => p.id === selectedPlan);
    const extending = info.isBusiness;
    return el("div", {}, [
      twSection(
        extending ? "Продлить подписку" : "Тарифы",
        plans.map((p) => {
          const selected = p.id === selectedPlan;
          return el(
            "button",
            {
              type: "button",
              class: `tw-row clickable tw-plan${selected ? " selected" : ""}`,
              role: "radio",
              "aria-checked": selected ? "true" : "false",
              disabled: !!buyingPlan,
              onclick: () => {
                selectedPlan = p.id;
                render();
              },
            },
            [
              el("span", { class: "tw-radio" }),
              el("span", { class: "tw-row-body" }, [
                el("span", { class: "tw-row-title" }, [
                  p.discount > 0 ? el("span", { class: "tw-plan-discount" }, `−${p.discount}%`) : null,
                  p.label,
                ]),
                el("span", { class: "tw-row-subtitle" }, p.months > 1 ? `${p.priceRub} ₽ за ${p.label}` : "Оплата за месяц"),
              ]),
              el("span", { class: "tw-row-right" }, `${Math.round(p.perMonth)} ₽/мес`),
            ]
          );
        }),
        extending
          ? "Новый срок прибавится к текущей дате окончания. Автопродления нет — списаний без вашего ведома не будет."
          : "Оплата переводом администрации Shalter. Автопродления нет — срок просто закончится сам."
      ),
      buyError ? el("p", { class: "tw-row-note danger" }, buyError) : null,
      el("div", { class: "tw-premium-footer tw-business-footer" }, [
        el(
          "button",
          { class: "tw-premium-confirm tw-business-confirm", disabled: !!buyingPlan || !current, onclick: () => current && buyBusiness(current.id) },
          buyingPlan ? "Открываем оплату…" : `${extending ? "Продлить" : "Подключить"} за ${current?.priceRub ?? 0} ₽`
        ),
      ]),
    ]);
  }

  async function buyBusiness(planId) {
    buyingPlan = planId;
    buyError = null;
    render();
    try {
      const res = await api.requestBusiness(planId);
      handlePurchaseResponse(res);
    } catch (err) {
      buyError = err.message;
    } finally {
      buyingPlan = null;
      render();
    }
  }

  async function saveBusiness(patch) {
    business = { ...business, ...patch };
    render();
    const { settings } = await api.patchSettings({ business });
    business = settings.business;
    render();
  }

  function setAutoMedia(key, attachments) {
    saveBusiness({ [key]: { ...business[key], attachments } });
  }
  async function attachAutoFile(key, file, kind) {
    const err = checkSize(file, kind);
    if (err) return alert(err);
    mediaBusyKey = key;
    render();
    try {
      const a = await uploadFile(file, kind);
      setAutoMedia(key, [{ ...a, kind }]);
    } catch (e) {
      alert(e.message || "Не удалось загрузить вложение");
    } finally {
      mediaBusyKey = null;
      render();
    }
  }
  async function startAutoRecording(key, mode) {
    if (recordingKey) return;
    recordingKey = key;
    recordMode = mode;
    render();
    try {
      recordingHandle = await startRecording(mode, {});
    } catch {
      recordingKey = recordMode = recordingHandle = null;
      alert("Нет доступа к микрофону или камере");
      return render();
    }
    render();
    recordingHandle.result.then(async (rec) => {
      const key2 = recordingKey;
      recordingHandle = recordingKey = recordMode = null;
      recordPreviewEl = null;
      render();
      if (!rec || !key2) return;
      const ext = (rec.mimeType || "").includes("mp4") ? "mp4" : "webm";
      const file = new File([rec.blob], `${mode}-${Date.now()}.${ext}`, { type: rec.mimeType });
      mediaBusyKey = key2;
      render();
      try {
        const a = await uploadFile(file, mode);
        setAutoMedia(key2, [{ ...a, kind: mode, durationSec: rec.durationSec }]);
      } catch (e) {
        alert(e.message || "Не удалось загрузить запись");
      } finally {
        mediaBusyKey = null;
        render();
      }
    });
  }
  function cancelAutoRecording() {
    recordingHandle?.cancel();
    recordingHandle = recordingKey = recordMode = null;
    recordPreviewEl = null;
    render();
  }
  function autoMediaPreview(a) {
    if (a.kind === "image") return ImageAttachment(a);
    if (a.kind === "video") return VideoAttachment(a);
    if (a.kind === "voice") return el("p", { class: "settings-toggle-hint" }, `🎤 Голосовое${a.durationSec ? ` · ${Math.round(a.durationSec)} с` : ""}`);
    if (a.kind === "video-note") return el("p", { class: "settings-toggle-hint" }, `⭕ Кружок${a.durationSec ? ` · ${Math.round(a.durationSec)} с` : ""}`);
    return FileAttachment(a);
  }
  function autoMediaBlock(key) {
    if (recordingKey === key) {
      const paused = recordingHandle?.isPaused?.() ?? false;
      const pauseBtn = el("button", {
        class: "settings-chip",
        title: paused ? "Продолжить" : "Пауза",
        onclick: () => {
          if (!recordingHandle) return;
          paused ? recordingHandle.resume?.() : recordingHandle.pause?.();
          render();
        },
      }, [el("span", { html: iconSvg(paused ? "Play" : "Pause", 16) })]);
      const bar = el("div", { class: "business-record-bar" }, [
        el("span", { class: "business-record-dot" }),
        el("span", { class: "settings-toggle-title" }, recordMode === "voice" ? "Идёт запись голосового…" : "Идёт запись кружка…"),
        pauseBtn,
        el("button", { class: "btn-accent", onclick: () => recordingHandle?.stop() }, "Готово"),
        el("button", { class: "settings-danger-link", onclick: cancelAutoRecording }, "Отмена"),
      ]);
      if (recordMode !== "video-note") return bar;
      if (!recordPreviewEl) recordPreviewEl = el("video", { autoplay: true, muted: true, playsinline: true, class: "composer-round-preview" });
      if (recordingHandle?.stream && recordPreviewEl.srcObject !== recordingHandle.stream) recordPreviewEl.srcObject = recordingHandle.stream;
      const flip = el("button", {
        class: "composer-round-flip",
        title: "Другая камера",
        html: iconSvg("FlipCamera", 18),
        onclick: async () => { await recordingHandle?.flipCamera?.(); render(); },
      });
      return el("div", { class: "business-record-round" }, [
        el("div", { class: "composer-round-wrap" }, [recordPreviewEl, flip]),
        bar,
      ]);
    }
    if (mediaBusyKey === key) return el("p", { class: "settings-toggle-hint" }, "Загрузка вложения…");
    const att = business[key]?.attachments?.[0];
    if (att) {
      return el("div", { class: "business-media-current" }, [
        autoMediaPreview(att),
        el("button", { class: "settings-danger-link", onclick: () => setAutoMedia(key, []) }, "Убрать вложение"),
      ]);
    }
    const fileInput = el("input", {
      type: "file",
      accept: "image/*,video/*",
      class: "hidden-input",
      onchange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) attachAutoFile(key, f, f.type.startsWith("video/") ? "video" : "image");
      },
    });
    const audioInput = el("input", {
      type: "file",
      accept: "audio/*",
      class: "hidden-input",
      onchange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) attachAutoFile(key, f, "file");
      },
    });
    return el("div", { class: "business-media-controls" }, [
      el("button", { class: "settings-chip", onclick: () => fileInput.click() }, "Фото или видео"),
      fileInput,
      el("button", { class: "settings-chip", onclick: () => audioInput.click() }, "Аудио или файл"),
      audioInput,
      isRecordingSupported() ? el("button", { class: "settings-chip", onclick: () => startAutoRecording(key, "voice") }, "🎤 Голосовое") : null,
      isRecordingSupported() ? el("button", { class: "settings-chip", onclick: () => startAutoRecording(key, "video-note") }, "⭕ Кружок") : null,
    ]);
  }

  function setDay(day, patch) {
    saveBusiness({ hours: { ...business.hours, [day]: { ...business.hours[day], ...patch } } });
  }
  function applyHours(fn) {
    const hours = {};
    for (const day of BUSINESS_DAY_KEYS) hours[day] = { ...business.hours[day], ...fn(day, business.hours[day]) };
    saveBusiness({ hours });
  }
  const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];
  const HOURS_PRESETS = [
    { label: "Будни 9–18", fn: (day) => (WEEKDAYS.includes(day) ? { closed: false, open: "09:00", close: "18:00" } : { closed: true }) },
    { label: "Каждый день 10–22", fn: () => ({ closed: false, open: "10:00", close: "22:00" }) },
    { label: "Круглосуточно", fn: () => ({ closed: false, open: "00:00", close: "24:00" }) },
    {
      label: "Как в понедельник — на все будни",
      fn: (day, d) => (WEEKDAYS.includes(day) ? { ...business.hours.mon } : d),
    },
  ];

  if (info.isBusiness && !business.timeZone && browserTimeZone()) {
    setTimeout(() => saveBusiness({ timeZone: browserTimeZone() }).catch(() => {}), 0);
  }

  function dayRow(day) {
    const d = business.hours[day];
    const timeInput = (value, onchange) =>
      el("input", { type: "time", class: "settings-input business-time-input mono", value, onchange: (e) => e.target.value && onchange(e.target.value) });
    return el("div", { class: "business-day-row" }, [
      el("span", { class: "settings-toggle-title business-day-name" }, DAY_LABELS[day]),
      d.closed
        ? el("span", { class: "settings-toggle-hint business-day-hours" }, "Выходной")
        : isAllDay(d)
          ? el("span", { class: "business-day-hours" }, [
              el("span", { class: "settings-toggle-hint" }, "Круглосуточно"),
              el("button", { class: "business-day-link", onclick: () => setDay(day, { open: "09:00", close: "18:00" }) }, "задать время"),
            ])
          : el("span", { class: "business-day-hours" }, [
              timeInput(d.open, (v) => setDay(day, { open: v })),
              el("span", { class: "settings-toggle-hint" }, "–"),
              timeInput(d.close === "24:00" ? "00:00" : d.close, (v) => setDay(day, { close: v })),
              el("button", { class: "business-day-link", title: "Круглосуточно", onclick: () => setDay(day, { open: "00:00", close: "24:00" }) }, "24 ч"),
            ]),
      Toggle(!d.closed, (v) => setDay(day, { closed: !v })),
    ]);
  }

  function hoursSection() {
    const status = businessStatus(business.hours, business.timeZone);
    const zones = timeZoneList();
    const currentZone = business.timeZone ?? browserTimeZone() ?? "UTC";
    if (!zones.includes(currentZone)) zones.unshift(currentZone);
    const overnightDays = BUSINESS_DAY_KEYS.filter((k) => !business.hours[k].closed && !isAllDay(business.hours[k]) && business.hours[k].close <= business.hours[k].open);
    return section("Часы работы", [
      el("p", { class: `business-status ${status.open ? "open" : "closed"}` }, `Сейчас: ${formatStatus(status, business.hours)}`),
      ...BUSINESS_DAY_KEYS.map(dayRow),
      overnightDays.length
        ? el(
            "p",
            { class: "settings-toggle-hint" },
            `Через полночь: ${overnightDays.map((k) => `${DAY_LABELS[k].toLowerCase()} ${formatDayHours(business.hours[k])}`).join(", ")}.`
          )
        : null,
      el(
        "div",
        { class: "business-presets" },
        HOURS_PRESETS.map((p) => el("button", { class: "admin-label-btn", onclick: () => applyHours(p.fn) }, p.label))
      ),
      el("div", { class: "settings-toggle-row" }, [
        el("div", {}, [
          el("p", { class: "settings-toggle-title" }, "Часовой пояс"),
          el("p", { class: "settings-toggle-hint" }, "По нему считаются часы работы и автоответ"),
        ]),
        el(
          "select",
          { class: "settings-input business-tz-select", onchange: (e) => saveBusiness({ timeZone: e.target.value }) },
          zones.map((z) => el("option", { value: z, selected: z === currentZone }, z.replace(/_/g, " ")))
        ),
      ]),
      el("div", { class: "settings-toggle-row" }, [
        el("div", {}, [
          el("p", { class: "settings-toggle-title" }, "Показывать в профиле"),
          el("p", { class: "settings-toggle-hint" }, "«Открыто · до 18:00» и расписание на неделю — видно всем, кто откроет ваш профиль"),
        ]),
        Toggle(business.showHours !== false, (v) => saveBusiness({ showHours: v })),
      ]),
    ]);
  }

  async function saveAddress() {
    addressSaving = true;
    render();
    try {
      const { user } = await api.updateProfile(getState().user.id, { businessAddress: addressDraft.trim() || null });
      info = { ...info, businessAddress: user.businessAddress ?? null };
    } catch (err) {
      alert(err.message || "Не удалось сохранить адрес");
    } finally {
      addressSaving = false;
      render();
    }
  }

  function addQuickReply() {
    const text = newReplyText.trim();
    if (!text) return;
    const quickReplies = [...(business.quickReplies ?? []), { shortcut: newReplyShortcut.trim(), text }];
    newReplyShortcut = "";
    newReplyText = "";
    saveBusiness({ quickReplies });
  }

  function removeQuickReply(id) {
    saveBusiness({ quickReplies: (business.quickReplies ?? []).filter((q) => q.id !== id) });
  }

  function render() {
    const rows = [];

    rows.push(businessHero());
    if (!info.isBusiness && plans.length) rows.push(businessPlans());
    if (!info.isBusiness) {
      rows.push(
        twSection(
          "Что входит",
          BUSINESS_PERKS.map((p) => twRow({ icon: p.icon, color: p.color, title: p.title, subtitle: p.desc }))
        )
      );
    } else {
      rows.push(
        el("div", { class: "settings-toggle-row" }, [
          el("div", {}, [
            el("p", { class: "settings-toggle-title" }, "Включено"),
            el("p", { class: "settings-toggle-hint" }, "Приветствие, автоответ и часы работы применяются только пока это включено"),
          ]),
          Toggle(business.enabled, (v) => saveBusiness({ enabled: v })),
        ]),
        hoursSection(),
        section("Приветствие", [
          el("div", { class: "settings-toggle-row" }, [
            el("span", { class: "settings-toggle-title" }, "Отправлять новому собеседнику"),
            Toggle(business.greeting.enabled, (v) => saveBusiness({ greeting: { ...business.greeting, enabled: v } })),
          ]),
          el("textarea", {
            class: "settings-input",
            rows: 2,
            placeholder: "Здравствуйте! Мы вам скоро ответим.",
            value: business.greeting.text,
            onblur: (e) => saveBusiness({ greeting: { ...business.greeting, text: e.target.value } }),
          }),
          autoMediaBlock("greeting"),
        ]),
        section("Автоответ вне часов работы", [
          el("div", { class: "settings-toggle-row" }, [
            el("span", { class: "settings-toggle-title" }, "Отправлять вне часов работы"),
            Toggle(business.away.enabled, (v) => saveBusiness({ away: { ...business.away, enabled: v } })),
          ]),
          el("textarea", {
            class: "settings-input",
            rows: 2,
            placeholder: "Сейчас мы не работаем — ответим, как только начнём.",
            value: business.away.text,
            onblur: (e) => saveBusiness({ away: { ...business.away, text: e.target.value } }),
          }),
          autoMediaBlock("away"),
        ]),
        section("Быстрые ответы", [
          ...(business.quickReplies ?? []).map((q) =>
            el("div", { class: "settings-toggle-row" }, [
              el("div", {}, [
                q.shortcut ? el("p", { class: "settings-toggle-title mono" }, `/${q.shortcut}`) : null,
                el("p", { class: "settings-toggle-hint" }, q.text),
              ]),
              el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 16), onclick: () => removeQuickReply(q.id) }),
            ])
          ),
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("input", {
              class: "settings-input mono",
              style: "max-width: 140px",
              placeholder: "ярлык",
              value: newReplyShortcut,
              oninput: (e) => (newReplyShortcut = e.target.value),
            }),
            el("input", {
              class: "settings-input",
              placeholder: "Текст быстрого ответа",
              value: newReplyText,
              oninput: (e) => (newReplyText = e.target.value),
            }),
          ]),
          el("button", { class: "btn-accent", onclick: addQuickReply }, "Добавить"),
        ]),
        section("Адрес на профиле", [
          el("input", {
            class: "settings-input",
            placeholder: "Город, улица, дом",
            value: addressDraft,
            oninput: (e) => (addressDraft = e.target.value),
          }),
          el("button", { class: "btn-accent", disabled: addressSaving, onclick: saveAddress }, addressSaving ? "Сохраняем…" : "Сохранить"),
        ])
      );
    }

    if (info.isBusiness && !info.businessForever && plans.length) rows.push(businessPlans());
    rows.push(
      twSection(null, [
        twRow({ icon: "Link", color: "blue", title: "Публичная страница", subtitle: "Ссылка о Premium и бизнес-подписке — откроется даже без аккаунта", href: "/premium#pm-business", target: "_blank" }),
      ])
    );
    mount(root, pageWrap("Shalter для бизнеса", null, rows));
  }
  render();
}

const ABOUT_TEAM = [{ name: "Shalter", role: "Независимый проект" }];

async function renderAbout(root) {
  let version = null;
  try {
    ({ version } = await api.getAppVersion());
  } catch {
  }

  mount(
    root,
    pageWrap("О приложении", null, [
      el("div", { class: "tw-media-header" }, [
        el("img", { class: "tw-about-logo", src: "/icons/icon-192.png", alt: "", onerror: (e) => e.target.remove() }),
        el("h2", { class: "tw-media-title" }, "Shalter"),
        el("p", { class: "tw-media-subtitle" }, "Мессенджер с чатами, звонками, историями, ботами и звёздами — без стороннего сервера: всё работает на вашей собственной инсталляции."),
      ]),
      twSection(null, [
        twRow({ icon: "Info", color: "grey", title: "Версия", titleRight: version || "—" }),
        ...ABOUT_TEAM.map((m) =>
          twRow({ icon: "Users", color: "purple", title: m.name, subtitle: m.role, href: m.url, target: m.url ? "_blank" : null })
        ),
      ]),
      twSection("Ссылки", [
        twRow({ icon: "Download", color: "green", title: "Скачать приложение", href: "/download" }),
        twRow({ icon: "Users", color: "orange", title: "Сотрудничество", href: "/promo" }),
        twRow({ icon: "MessageSquare", color: "blue", title: "Поддержка — Hugo", onClick: openSupport }),
      ]),
    ])
  );
}

async function renderPartners(root) {
  let info = null;
  let loadError = null;
  let opening = false;
  let openError = null;
  try {
    info = await api.getPartnerInfo();
  } catch (err) {
    loadError = err.message;
  }

  async function openChat() {
    opening = true;
    openError = null;
    render();
    try {
      const { chatId } = await api.openPartnerChat();
      navigate(`/chat/${chatId}`);
    } catch (err) {
      openError = err.message || "Не удалось открыть чат";
      opening = false;
      render();
    }
  }

  function render() {
    mount(
      root,
      pageWrap("Партнёрка", null, [
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-session-hero-icon", style: `background-color: ${TW_ROW_COLORS.purple}`, html: iconSvg("Users", 52) }),
          el("h2", { class: "tw-media-title" }, "Партнёрская программа"),
          el("p", { class: "tw-media-subtitle" }, "Условия сотрудничества и связь с администрацией."),
        ]),
        loadError ? el("p", { class: "tw-row-note danger" }, loadError) : null,
        info ? twSection("Тарифы", [el("p", { class: "tw-section-text" }, info.tariffText)]) : null,
        twSection(null, [
          twButton({ icon: "MessageSquare", text: opening ? "Открываем чат…" : "Написать администратору", disabled: opening, onClick: openChat }),
        ], openError),
      ])
    );
  }
  render();
}

async function renderEmojiCatalog(root) {
  let emoji = [];
  let error = null;
  let notice = null;
  try {
    ({ emoji } = await api.listCustomEmoji());
  } catch (err) {
    error = err.message || "Не удалось загрузить эмодзи";
  }

  function create() {
    openAnimatorEditor({
      title: "Нарисовать эмодзи",
      saveLabel: "Сохранить эмодзи",
      onSave: async (scene) => {
        const name = ((await askText("Название эмодзи (необязательно)")) || "").trim();
        try {
          const { emoji: created } = await api.createCustomEmoji(name, scene);
          emoji = [created, ...emoji];
          notice = "Эмодзи добавлен";
        } catch (err) {
          error = err.message || "Не удалось сохранить";
        }
        render();
      },
    });
  }

  function edit(em) {
    openAnimatorEditor({
      title: "Изменить эмодзи",
      saveLabel: "Сохранить",
      initial: em.scene,
      onSave: async (scene) => {
        try {
          const { emoji: updated } = await api.updateCustomEmoji(em.id, { scene });
          emoji = emoji.map((e) => (e.id === updated.id ? updated : e));
          notice = "Эмодзи обновлён";
        } catch (err) {
          error = err.message || "Не удалось сохранить";
        }
        render();
      },
    });
  }

  async function remove(em) {
    if (!(await askConfirm(`Удалить эмодзи${em.name ? ` «${em.name}»` : ""}?`))) return;
    try {
      await api.deleteCustomEmoji(em.id);
      emoji = emoji.filter((e) => e.id !== em.id);
      notice = "Эмодзи удалён";
    } catch (err) {
      error = err.message || "Не удалось удалить";
    }
    render();
  }

  function render() {
    mount(
      root,
      pageWrap("Эмодзи", "Анимированные эмодзи Shalter — их рисуете вы, вставляют все", [
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,
        el("button", { class: "btn-accent", onclick: create }, "✏️ Нарисовать эмодзи"),
        el("p", { class: "settings-section-title" }, `В каталоге — ${emoji.length}`),
        emoji.length === 0
          ? el("p", { class: "empty-hint" }, "Пока ничего не нарисовано")
          : el(
              "div",
              { class: "emoji-admin-grid" },
              emoji.map((em) =>
                el("div", { class: "emoji-admin-cell" }, [
                  el("span", { class: "emoji-admin-art" }, [renderCustomScene(em.scene, { size: 44 })]),
                  em.name ? el("span", { class: "emoji-admin-name" }, em.name) : null,
                  el("div", { class: "emoji-admin-actions" }, [
                    el("button", { class: "icon-btn", title: "Изменить", html: iconSvg("Edit", 14), onclick: () => edit(em) }),
                    el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 14), onclick: () => remove(em) }),
                  ]),
                ])
              )
            ),
      ])
    );
  }
  render();
}

async function renderOAuthApps(root) {
  let { apps } = await api.listOAuthApps();
  let name = "";
  let redirectUri = "";
  let createError = null;
  let creating = false;
  let freshSecret = null;

  const nameInput = el("input", { class: "settings-input", placeholder: "Название приложения" });
  const redirectInput = el("input", { class: "settings-input mono", placeholder: "https://ваш-сайт.example/callback" });
  nameInput.addEventListener("input", () => (name = nameInput.value));
  redirectInput.addEventListener("input", () => (redirectUri = redirectInput.value));

  async function create() {
    if (creating) return;
    creating = true;
    createError = null;
    render();
    try {
      const { app } = await api.createOAuthApp(name.trim(), redirectUri.trim());
      apps = [{ id: app.id, name: app.name, clientId: app.clientId, redirectUri: app.redirectUri, createdAt: app.createdAt }, ...apps];
      freshSecret = { clientId: app.clientId, clientSecret: app.clientSecret };
      openOAuthSecretDialog(app.name, { clientId: app.clientId, clientSecret: app.clientSecret }, { fresh: true });
      name = "";
      redirectUri = "";
      nameInput.value = "";
      redirectInput.value = "";
    } catch (err) {
      createError = err.message || "Не удалось создать приложение";
    } finally {
      creating = false;
      render();
    }
  }

  async function remove(app) {
    if (!(await askConfirm(`Удалить приложение «${app.name}»? Все, кто вошёл через него, будут отключены.`))) return;
    await api.deleteOAuthApp(app.id);
    apps = apps.filter((a) => a.id !== app.id);
    if (freshSecret?.clientId === app.clientId) freshSecret = null;
    render();
  }

  async function regenerate(app) {
    if (!(await askConfirm(`Перегенерировать секрет «${app.name}»? Старый секрет сразу перестанет работать.`))) return;
    const { app: updated } = await api.regenerateOAuthApp(app.id);
    freshSecret = { clientId: updated.clientId, clientSecret: updated.clientSecret };
    openOAuthSecretDialog(updated.name ?? app.name, { clientId: updated.clientId, clientSecret: updated.clientSecret }, { fresh: true });
    render();
  }

  async function showSecret(app) {
    try {
      const creds = await api.getOAuthAppSecret(app.id);
      openOAuthSecretDialog(app.name, creds, { fresh: false });
    } catch (err) {
      alert(err.message || "Не удалось получить ключ");
    }
  }

  function render() {
    mount(
      root,
      pageWrap("Войти через Shalter", "Разрешите своему сайту принимать вход через Shalter — как «Войти через VK»", [
        el("a", { class: "settings-row", href: "/oauth-docs", target: "_blank", rel: "noopener" }, [
          el("span", { class: "settings-row-icon", html: iconSvg("Globe", 22) }),
          el("span", { class: "settings-row-label" }, "Документация для разработчиков"),
        ]),
        section("Новое приложение", [
          nameInput,
          redirectInput,
          el(
            "p",
            { class: "settings-toggle-hint" },
            "redirect_uri — адрес на вашем сайте, куда Shalter вернёт человека после входа (https://, кроме localhost для разработки)."
          ),
          createError ? el("p", { class: "login-error" }, createError) : null,
          el("button", { class: "btn-accent", disabled: creating, onclick: create }, creating ? "Создаём…" : "Создать приложение"),
        ]),
        freshSecret
          ? section("Секрет — сохраните сейчас, повторно не покажется", [
              el("div", { class: "referral-code-row" }, [
                el("span", { class: "mono" }, `client_id: ${freshSecret.clientId}`),
              ]),
              el("div", { class: "referral-code-row" }, [
                el("span", { class: "mono" }, `client_secret: ${freshSecret.clientSecret}`),
                el("button", {
                  class: "icon-btn",
                  title: "Скопировать секрет",
                  html: iconSvg("Copy", 16),
                  onclick: () => navigator.clipboard.writeText(freshSecret.clientSecret).catch(() => {}),
                }),
              ]),
              el(
                "p",
                { class: "settings-toggle-hint" },
                "client_secret нужен только вашему серверу (для POST /api/oauth/token) — никогда не кладите его в код браузера/приложения."
              ),
            ])
          : null,
        el("p", { class: "settings-section-title" }, `Ваши приложения — ${apps.length}`),
        apps.length === 0
          ? el("p", { class: "empty-hint" }, "Пока ничего не зарегистрировано")
          : el(
              "div",
              { class: "settings-devices-list" },
              apps.map((a) =>
                el("div", { class: "settings-device-row" }, [
                  el("div", { class: "settings-device-body" }, [
                    el("p", {}, a.name),
                    el("p", { class: "mono settings-toggle-hint" }, a.redirectUri),
                    el("p", { class: "mono settings-toggle-hint" }, `client_id: ${a.clientId}`),
                  ]),
                  el("button", {
                    class: "icon-btn",
                    title: "Показать и скопировать ключ",
                    html: iconSvg("Copy", 16),
                    onclick: () => showSecret(a),
                  }),
                  el("button", {
                    class: "icon-btn",
                    title: "Перегенерировать секрет",
                    html: iconSvg("Key", 16),
                    onclick: () => regenerate(a),
                  }),
                  el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 16), onclick: () => remove(a) }),
                ])
              )
            ),
        section("Как подключить", [
          el(
            "p",
            { class: "settings-toggle-hint" },
            "1. Отправьте человека на страницу входа с вашими client_id и redirect_uri — он подтверждает вход и возвращается к вам с кодом."
          ),
          el(
            "p",
            { class: "settings-toggle-hint mono" },
            `${window.location.origin}/oauth/authorize?client_id=ВАШ_CLIENT_ID&redirect_uri=ВАШ_REDIRECT_URI&state=что-угодно`
          ),
          el("p", { class: "settings-toggle-hint" }, "2. Ваш сервер меняет код на токен (client_secret — только на сервере, не в браузере):"),
          codeBlock(
            `curl -X POST ${window.location.origin}/api/oauth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"client_id":"...","client_secret":"...","code":"...","redirect_uri":"..."}'`
          ),
          el("p", { class: "settings-toggle-hint" }, "3. Токеном из ответа проверяете, что вход действительно сработал, и получаете профиль:"),
          codeBlock(`curl ${window.location.origin}/api/oauth/userinfo \\\n  -H "Authorization: Bearer ВАШ_ACCESS_TOKEN"`),
        ]),
      ])
    );
  }
  render();
}

function codeBlock(text) {
  return el("div", { class: "settings-code-block" }, [
    el("pre", { class: "mono" }, text),
    el("button", {
      class: "icon-btn",
      title: "Скопировать",
      html: iconSvg("Copy", 14),
      onclick: () => navigator.clipboard.writeText(text).catch(() => {}),
    }),
  ]);
}

async function renderAds(root) {
  const cabinetSlot = el("div", { class: "ad-cabinet-slot" });

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
      pageWrap("Реклама", "Кабинет для бизнеса: кампании с бюджетом в звёздах, показы в каталоге каналов и объявление на своей странице", [
        cabinetSlot,
        el("p", { class: "settings-section-title" }, "Объявление на своей странице"),

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
              el("p", { class: "settings-toggle-title" }, `Купить кабинет рекламы на ${info.days ?? 30} дней — ${info.priceRub}₽`),
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
  AdCabinet(cabinetSlot);
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
    if (!(await askConfirm(`Обновить токен бота «${bot.user.name}»? Старый токен перестанет работать.`))) return;
    const { token } = await api.regenerateBotToken(bot.id);
    openBotTokenDialog(bot.user.name, token);
  }

  async function remove(bot) {
    if (!(await askConfirm(`Удалить бота «${bot.user.name}» безвозвратно?`))) return;
    await api.deleteBot(bot.id);
    bots = bots.filter((b) => b.id !== bot.id);
    render();
  }

  function render() {
    mount(
      root,
      pageWrap("Боты", "Настоящие боты, которых можно программировать как угодно", [
        el("div", { class: "settings-notice-box bot-ways" }, [
          el("p", { class: "settings-toggle-title" }, "Три вещи, которые можно сделать"),
          el("div", { class: "bot-way" }, [
            el("span", { class: "bot-way-icon", html: iconSvg("Code", 14) }),
            el("p", {}, [el("strong", {}, "Код прямо здесь. "), "Значок «</>» у бота — встроенный редактор, программа выполняется на сервере Shalter."]),
          ]),
          el("div", { class: "bot-way" }, [
            el("span", { class: "bot-way-icon", html: iconSvg("Globe", 14) }),
            el("p", {}, [el("strong", {}, "Свой скрипт. "), "Любой язык, любой сервер — через Bot API и токен бота."]),
          ]),
          el("div", { class: "bot-way" }, [
            el("span", { class: "bot-way-icon", html: iconSvg("Image", 14) }),
            el("p", {}, [el("strong", {}, "Мини-приложение. "), "Страница с интерфейсом внутри Shalter — хостинг не нужен, код хранится здесь."]),
          ]),
          el("a", { href: "/bots", target: "_blank", rel: "noreferrer", class: "text-link" }, "Документация Bot API →"),
        ]),
        el("button", { class: "btn-accent bot-create-btn", onclick: createBot }, [el("span", { html: iconSvg("Plus", 15) }), " Создать бота"]),
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
                    el("p", {}, [b.user.name, VerifiedBadge(b.user, 13)].filter(Boolean)),
                    el("p", { class: "mono settings-toggle-hint" }, `@${b.user.username}`),
                    el("div", { class: "bot-badges" }, [
                      b.code?.trim() ? el("span", { class: "bot-badge" }, "код") : null,
                      b.appCode || b.appUrl ? el("span", { class: "bot-badge accent" }, "приложение") : null,
                      b.commands?.length ? el("span", { class: "bot-badge" }, `${b.commands.length} команд`) : null,
                    ]),
                  ]),
                  el("button", {
                    class: "icon-btn",
                    title: "Открыть чат с ботом",
                    html: iconSvg("Send", 15),
                    onclick: async () => {
                      try {
                        const { chat } = await api.startDm(b.userId, b.user.name, b.user.avatarColor);
                        navigate(`/chat/${chat.id}`);
                      } catch (err) {
                        alert(err.message || "Не удалось открыть чат");
                      }
                    },
                  }),
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
                  el("button", {
                    class: "icon-btn",
                    title: "Показать токен",
                    html: iconSvg("Key", 15),
                    onclick: async () => {
                      try {
                        const { token } = await api.getBotToken(b.id);
                        openBotTokenDialog(b.user.name, token, { fresh: false });
                      } catch (err) {
                        alert(err.message || "Не удалось получить токен");
                      }
                    },
                  }),
                  el("button", {
                    class: "icon-btn",
                    title: "Код бота",
                    html: iconSvg("Code", 15),
                    onclick: () =>
                      openBotCodeDialog(b, (code) => {
                        b.code = code;
                        render();
                      }),
                  }),
                  el("button", {
                    class: "icon-btn",
                    title: "Команды бота",
                    html: iconSvg("BarChart", 15),
                    onclick: async () => {
                      const current = (b.commands ?? []).map((c) => `${c.command} - ${c.description ?? ""}`.trim()).join("\n");
                      const next = (await askText("Команды бота, по одной в строке:\n\nstart - Начать\nhelp - Помощь",
                        current));
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
  const ACCENTS = [
    "",
    "#3390EC", "#E53935", "#4FAE4E", "#E39D2B", "#8774E1", "#1C9BD9", "#D9822E",
    "#00A99D", "#8BC34A", "#E56B3B", "#E0507A", "#C2185B", "#7C6FD6", "#5C6BC0", "#607D8B",
  ];
  let wallpaperError = null;
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
    applyAccentSetting(hex);
  }
  applyAccent(settings.accent);

  async function patch(p) {
    settings = { ...settings, ...p };
    if (p.theme) applyTheme(p.theme);
    if ("accent" in p) applyAccent(p.accent);
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
      pageWrap("Внешний вид", null, [
        section("Размер текста", [
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("span", { class: "settings-toggle-title" }, "Размер текста сообщений"),
            el("span", { class: "tw-range-value" }, `${settings.fontSize}`),
          ]),
          el("input", {
            type: "range",
            min: 13,
            max: 19,
            value: settings.fontSize,
            class: "settings-range",
            style: `--p: ${((settings.fontSize - 13) / 6) * 100}%`,
            oninput: (e) => patch({ fontSize: Number(e.target.value) }),
          }),
        ]),
        twSection(
          "Тема",
          THEMES.map((t) =>
            el("button", { type: "button", class: `tw-row clickable tw-radio-row${settings.theme === t.id ? " selected" : ""}`, onclick: () => patch({ theme: t.id }) }, [
              el("span", { class: "tw-radio" }),
              el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, t.label)]),
            ])
          )
        ),
        section("Акцентный цвет", [
          el(
            "div",
            { class: "settings-swatch-row" },
            ACCENTS.map((hex) =>
              el("button", {
                class: `settings-swatch ${(hex ? settings.accent === hex : isThemeAccent(settings.accent)) ? "active" : ""}`,
                title: hex ? hex : "Как в теме",
                style: { background: hex || "linear-gradient(135deg, #3390ec 50%, #8774e1 50%)" },
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
            el("p", { class: "settings-toggle-hint unsupported-lang-note" }, UNSUPPORTED_LANGUAGE_NOTE),
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
            el("p", { class: "settings-toggle-hint unsupported-lang-note" }, UNSUPPORTED_LANGUAGE_NOTE),
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

  let diag = null;
  let checking = false;
  const refreshDiag = () => {
    pushDiagnostics()
      .then((d) => {
        diag = d;
        render();
      })
      .catch(() => {});
  };
  refreshDiag();

  function chainRow(label, ok, hint) {
    return twRow({
      cls: `tw-check-row ${ok ? "ok" : "fail"}`,
      icon: ok ? "Check" : "X",
      color: ok ? "green" : "red",
      title: label,
      subtitle: hint,
    });
  }

  function render() {
    const canRequest = typeof Notification !== "undefined" && Notification.permission === "default";
    mount(
      root,
      pageWrap("Уведомления", null, [
        twSection("Уведомления о сообщениях", [
          twRow({
            icon: "MessageSquare",
            color: "blue",
            title: "Предпросмотр сообщений",
            subtitle: settings.notifications.previewText ? "Текст сообщения в уведомлении" : "«Новое сообщение» без содержимого",
            toggle: { checked: settings.notifications.previewText, onChange: (v) => patch({ previewText: v }) },
          }),
          twRow({
            icon: "Volume",
            color: "green",
            title: "Звук",
            toggle: { checked: settings.notifications.sound, onChange: (v) => patch({ sound: v }) },
          }),
        ]),
        twSection(
          "Уведомления браузера",
          [
            twRow({ icon: "Bell", color: "red", title: "Статус", titleRight: permLabel() }),
            iosNeedsHomeScreen()
              ? el("p", { class: "tw-row-note danger" }, "На iPhone уведомления приходят, только если Shalter добавлен на экран «Домой»: в Safari нажмите «Поделиться» → «На экран „Домой“», откройте Shalter с иконки и разрешите уведомления (нужна iOS 16.4 или новее).")
              : null,
            canRequest
              ? twButton({ icon: "Bell", text: "Включить уведомления", onClick: async () => { await requestPushPermission().catch(() => {}); refreshDiag(); } })
              : null,
            twButton({
              icon: "Download",
              text: checking ? "Проверяем…" : "Переподключить уведомления",
              disabled: checking,
              onClick: async () => {
                checking = true;
                render();
                const res = await resubscribePush();
                checking = false;
                if (!res.ok) diag = { ...(diag ?? {}), ошибка: res.ошибка };
                refreshDiag();
              },
            }),
          ],
          "Уведомления приходят, даже когда вкладка закрыта."
        ),
        twSection(
          "Проверка",
          diag
            ? [
                chainRow("Защищённый адрес (https)", diag.защищённыйАдрес, diag.защищённыйАдрес ? null : "Push работает только по https — по http браузер его не даёт вовсе"),
                chainRow("Браузер поддерживает push", diag.поддержка, null),
                chainRow("Разрешение выдано", diag.разрешение === "granted", diag.разрешение === "denied" ? "Запрещено в настройках браузера — снимите запрет для этого сайта" : null),
                chainRow("Подписка создана в браузере", diag.подпискаВБраузере, null),
                chainRow("Сервер знает это устройство", diag.подпискаНаСервере, null),
                diag.ошибка ? el("p", { class: "tw-row-note danger" }, diag.ошибка) : null,
              ]
            : [twRow({ title: "Проверяем…" })]
        ),
      ])
    );
  }
  render();
}

async function renderHolidays(root) {
  const { settings: initial, holidayCatalog } = await api.getSettings();
  let settings = initial;
  let newTitle = "";
  let newDate = "";
  let addError = null;
  let editingHolidayId = null;
  let editTitle = "";
  let editDate = "";

  function isEnabled(id) {
    return !(settings.holidays?.disabled ?? []).includes(id);
  }

  async function toggle(id, enabled) {
    const disabled = new Set(settings.holidays?.disabled ?? []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    settings = { ...settings, holidays: { ...settings.holidays, disabled: [...disabled] } };
    render();
    await api.patchSettings({ holidays: settings.holidays });
  }

  function parseDayMonth(input) {
    const raw = String(input ?? "").trim();
    let month, day;
    const iso = raw.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (iso) {
      month = Number(iso[1]);
      day = Number(iso[2]);
    } else {
      const dm = raw.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
      if (!dm) return null;
      day = Number(dm[1]);
      month = Number(dm[2]);
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function monthDayToInputDate(mmdd) {
    if (!/^\d{2}-\d{2}$/.test(mmdd || "")) return "";
    return `${new Date().getFullYear()}-${mmdd}`;
  }

  async function addCustom() {
    const title = newTitle.trim();
    const date = parseDayMonth(newDate);
    if (!title) return (addError = "Укажите название праздника");
    if (!date) return (addError = "Дата — в формате ДД.ММ, например 14.02");
    addError = null;
    const custom = [...(settings.holidays?.custom ?? []), { title, date }];
    settings = { ...settings, holidays: { ...settings.holidays, custom } };
    newTitle = "";
    newDate = "";
    render();
    const { settings: saved } = await api.patchSettings({ holidays: settings.holidays });
    settings = saved;
    render();
  }

  async function removeCustom(id) {
    const custom = (settings.holidays?.custom ?? []).filter((h) => h.id !== id);
    settings = { ...settings, holidays: { ...settings.holidays, custom } };
    render();
    await api.patchSettings({ holidays: settings.holidays });
  }

  function startEditHoliday(h) {
    editingHolidayId = h.id;
    editTitle = h.title;
    editDate = monthDayToInputDate(h.date);
    addError = null;
    render();
  }

  async function saveEditHoliday(id) {
    const title = editTitle.trim();
    const date = parseDayMonth(editDate);
    if (!title) return ((addError = "Укажите название праздника"), render());
    if (!date) return ((addError = "Дата — в формате ДД.ММ, например 14.02"), render());
    const custom = (settings.holidays?.custom ?? []).map((h) => (h.id === id ? { ...h, title, date } : h));
    settings = { ...settings, holidays: { ...settings.holidays, custom } };
    editingHolidayId = null;
    addError = null;
    render();
    const { settings: saved } = await api.patchSettings({ holidays: settings.holidays });
    settings = saved;
    render();
  }

  async function deleteBuiltin(id) {
    const disabled = new Set(settings.holidays?.disabled ?? []);
    disabled.add(id);
    settings = { ...settings, holidays: { ...settings.holidays, disabled: [...disabled] } };
    render();
    await api.patchSettings({ holidays: settings.holidays });
  }
  async function restoreBuiltins() {
    const catalogIds = new Set(holidayCatalog.map((h) => h.id));
    const disabled = (settings.holidays?.disabled ?? []).filter((id) => !catalogIds.has(id));
    settings = { ...settings, holidays: { ...settings.holidays, disabled } };
    render();
    await api.patchSettings({ holidays: settings.holidays });
  }
  async function editBuiltin(h) {
    const disabled = new Set(settings.holidays?.disabled ?? []);
    disabled.add(h.id);
    const custom = [...(settings.holidays?.custom ?? []), { title: h.title, date: h.date }];
    settings = { ...settings, holidays: { ...settings.holidays, disabled: [...disabled], custom } };
    render();
    const { settings: saved } = await api.patchSettings({ holidays: settings.holidays });
    settings = saved;
    const created = [...(saved.holidays?.custom ?? [])].reverse().find((c) => c.title === h.title && c.date === h.date);
    if (created) startEditHoliday(created);
    else render();
  }

  function render() {
    const custom = settings.holidays?.custom ?? [];
    const anyBuiltinHidden = holidayCatalog.some((h) => !isEnabled(h.id));
    mount(
      root,
      pageWrap("Праздники", "Напоминания в личном чате с Shalter в день праздника", [
        section("Встроенные", [
          ...holidayCatalog
            .filter((h) => isEnabled(h.id))
            .map((h) =>
              el("div", { class: "settings-toggle-row" }, [
                el("span", { class: "settings-toggle-title" }, h.title),
                el("div", { class: "label-row-actions" }, [
                  el("button", { class: "settings-danger-link", onclick: () => editBuiltin(h) }, "Изменить"),
                  el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 16), onclick: () => deleteBuiltin(h.id) }),
                ]),
              ])
            ),
          anyBuiltinHidden
            ? el("button", { class: "settings-danger-link", onclick: restoreBuiltins }, "Вернуть скрытые встроенные")
            : null,
        ]),
        section("Свои праздники", [
          ...custom.map((h) => {
            if (editingHolidayId === h.id) {
              const titleI = el("input", { class: "settings-input", value: editTitle, oninput: (e) => (editTitle = e.target.value) });
              const dateI = el("input", { type: "date", class: "settings-input", style: "max-width: 170px", value: editDate, oninput: (e) => (editDate = e.target.value) });
              return el("div", { class: "settings-notice-box" }, [
                el("div", { class: "settings-toggle-row no-divider" }, [titleI, dateI]),
                el("div", { class: "label-row-actions" }, [
                  el("button", { class: "btn-accent", onclick: () => saveEditHoliday(h.id) }, "Сохранить"),
                  el("button", { class: "settings-danger-link", onclick: () => { editingHolidayId = null; addError = null; render(); } }, "Отмена"),
                ]),
              ]);
            }
            return el("div", { class: "settings-toggle-row" }, [
              el("div", {}, [
                el("p", { class: "settings-toggle-title" }, h.title),
                el("p", { class: "settings-toggle-hint mono" }, h.date.split("-").reverse().join(".")),
              ]),
              el("div", { class: "label-row-actions" }, [
                el("button", { class: "settings-danger-link", onclick: () => startEditHoliday(h) }, "Изменить"),
                el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 16), onclick: () => removeCustom(h.id) }),
              ]),
            ]);
          }),
          el("div", { class: "settings-toggle-row no-divider" }, [
            el("input", {
              class: "settings-input",
              placeholder: "Название праздника",
              value: newTitle,
              oninput: (e) => (newTitle = e.target.value),
            }),
            el("input", {
              type: "date",
              class: "settings-input",
              style: "max-width: 170px",
              value: newDate,
              oninput: (e) => (newDate = e.target.value),
            }),
          ]),
          addError ? el("p", { class: "login-error" }, addError) : null,
          el("button", { class: "btn-accent", onclick: addCustom }, "Добавить праздник"),
        ]),
      ])
    );
  }
  render();
}

async function renderPrivacy(root) {
  const { settings: initial } = await api.getSettings();
  let blockedUsers = [];
  api
    .getBlockedUsers()
    .then((r) => {
      blockedUsers = r.users ?? [];
      render();
    })
    .catch(() => {});
  let settings = initial;
  let blockedIds = new Set(getState().user.blockedUserIds ?? []);
  let passcodeOn = hasPasscode();
  let biometricOn = hasBiometric();
  let biometricAvailable = false;
  isBiometricAvailable().then((v) => {
    biometricAvailable = v;
    if (v) render();
  });
  let passkeyList = [];
  let passkeyNotice = null;
  if (passkeysSupported()) {
    api.listPasskeys().then((res) => {
      passkeyList = res.passkeys ?? [];
      render();
    }, () => {});
  }
  async function addPasskey() {
    passkeyNotice = null;
    try {
      await registerPasskey();
      passkeyList = (await api.listPasskeys()).passkeys ?? [];
      passkeyNotice = "Ключ доступа добавлен — теперь можно входить без пароля и кода";
    } catch (err) {
      passkeyNotice = passkeyErrorText(err);
    }
    render();
  }
  async function removePasskey(p) {
    if (!(await askConfirm(`Удалить ключ «${p.name}»? Войти с ним больше не получится.`))) return;
    try {
      await api.deletePasskey(p.id);
      passkeyList = passkeyList.filter((x) => x.id !== p.id);
    } catch (err) {
      alert(err.message || "Не удалось удалить ключ");
    }
    render();
  }
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
    updateSelf({ blockedUserIds: [...blockedIds] });
    render();
  }

  function openExceptions(label, key) {
    openPrivacyExceptionsDialog({
      title: `Исключения — ${label}`,
      users: [],
      value: settings.privacy?.exceptions?.[key],
      onSave: (value) =>
        patch({
          exceptions: { ...(settings.privacy?.exceptions ?? {}), [key]: value },
        }),
    });
  }

  const RULES = [
    { key: "phone", label: "Номер телефона", who: "Кто видит мой номер телефона" },
    { key: "discoverByPhone", label: "Поиск по номеру", who: "Кто может найти меня по номеру" },
    { key: "lastSeen", label: "Время захода", who: "Кто видит время моего последнего захода" },
    { key: "photo", label: "Фото профиля", who: "Кто видит фото моего профиля" },
    { key: "bio", label: "О себе", who: "Кто видит раздел «О себе»" },
    { key: "birthday", label: "Дата рождения", who: "Кто видит мою дату рождения" },
    { key: "forwards", label: "Пересылка сообщений", who: "Кто может ссылаться на мой аккаунт при пересылке" },
    { key: "calls", label: "Звонки", who: "Кто может мне звонить" },
    { key: "invites", label: "Группы и каналы", who: "Кто может добавлять меня в группы" },
    { key: "messages", label: "Сообщения", who: "Кто может мне писать" },
    { key: "botMessages", label: "Боты", who: "Какие боты могут писать первыми" },
    { key: "storiesArchive", label: "Архив историй", who: "Кто видит архив моих историй" },
  ];
  const optionLabel = (v) => OPTIONS.find((o) => o.value === v)?.label ?? "Все";

  // Подстраница внутри раздела: правило приватности, заблокированные, ключи доступа.
  let sub = null;
  // «Назад» в шапке на подстранице возвращает к списку, а не в меню настроек.
  root.closest(".settings-panel")?.querySelector(".settings-header-back")?.addEventListener(
    "click",
    (e) => {
      if (!sub || !root.isConnected) return;
      e.stopImmediatePropagation();
      openSub(null);
    },
    true
  );
  function openSub(next) {
    sub = next;
    setPanelTitle(sub ? sub.title : "Конфиденциальность");
    root.scrollTop = 0;
    render();
  }

  function exceptionCounts(key) {
    const exc = settings.privacy?.exceptions?.[key] ?? {};
    return { allow: exc.allow?.length ?? 0, deny: exc.deny?.length ?? 0 };
  }

  function ruleSubtitle(key) {
    const { allow, deny } = exceptionCounts(key);
    const extra = [allow ? `+${allow}` : null, deny ? `−${deny}` : null].filter(Boolean).join(" ");
    return extra ? `${optionLabel(settings.privacy[key])} (${extra})` : optionLabel(settings.privacy[key]);
  }

  function editExceptions(rule, kind) {
    const current = settings.privacy?.exceptions?.[rule.key] ?? {};
    openPrivacyExceptionsDialog({
      title: kind === "allow" ? "Всегда разрешать" : "Никогда не разрешать",
      users: [],
      value: current,
      onSave: (value) => patch({ exceptions: { ...(settings.privacy?.exceptions ?? {}), [rule.key]: value } }),
    });
  }

  function renderRule(rule) {
    const value = settings.privacy[rule.key] ?? "everyone";
    const { allow, deny } = exceptionCounts(rule.key);
    return [
      twSection(
        rule.who,
        OPTIONS.map((o) =>
          el("button", { type: "button", class: `tw-row clickable tw-radio-row${value === o.value ? " selected" : ""}`, onclick: () => patch({ [rule.key]: o.value }) }, [
            el("span", { class: "tw-radio" }),
            el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, o.label)]),
          ])
        ),
        "Можно добавить пользователей в исключения — они будут видеть или не видеть это вне зависимости от выбора."
      ),
      twSection(
        "Исключения",
        [
          value !== "everyone"
            ? twRow({ icon: "Plus", color: "green", title: "Всегда разрешать", titleRight: allow ? String(allow) : null, subtitle: allow ? null : "Добавить пользователей", onClick: () => editExceptions(rule, "allow") })
            : null,
          value !== "nobody"
            ? twRow({ icon: "X", color: "red", title: "Никогда не разрешать", titleRight: deny ? String(deny) : null, subtitle: deny ? null : "Добавить пользователей", onClick: () => editExceptions(rule, "deny") })
            : null,
        ],
        "Исключения переопределяют настройку выше."
      ),
    ];
  }

  function renderBlocked(blocked) {
    return [
      twSection(
        null,
        blocked.length
          ? blocked.map((u) =>
              el("div", { class: "tw-row tw-user-row" }, [
                Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 42 }),
                el("span", { class: "tw-row-body" }, [
                  el("span", { class: "tw-row-title" }, u.name),
                  u.username ? el("span", { class: "tw-row-subtitle" }, `@${u.username}`) : null,
                ]),
                el("button", { class: "tw-link-btn", onclick: () => unblock(u.id) }, "Разблокировать"),
              ])
            )
          : [el("p", { class: "tw-empty" }, "Никого не заблокировано")],
        "Заблокированные пользователи не могут писать вам, звонить и добавлять вас в группы."
      ),
    ];
  }

  function renderPasskeys() {
    return [
      el("div", { class: "tw-media-header" }, [
        el("span", { class: "tw-media-sticker", html: iconSvg("Key", 56) }),
        el("p", { class: "tw-media-subtitle" }, "Вход по отпечатку, лицу или PIN-коду устройства — без пароля и кода. Ключ нельзя украсть фишингом."),
      ]),
      twSection(
        "Ваши ключи",
        [
          ...passkeyList.map((p) =>
            twRow({
              icon: "Key",
              color: "orange",
              title: p.name,
              subtitle: p.lastUsedAt
                ? `Последний вход: ${new Date(p.lastUsedAt).toLocaleDateString("ru-RU")}`
                : `Добавлен ${new Date(p.createdAt).toLocaleDateString("ru-RU")}`,
              right: el("button", { class: "icon-btn danger", title: "Удалить", html: iconSvg("Trash", 20), onclick: (e) => { e.stopPropagation(); removePasskey(p); } }),
            })
          ),
          twButton({ icon: "Plus", text: "Создать ключ доступа", onClick: addPasskey }),
        ],
        passkeyNotice
      ),
    ];
  }

  async function deleteAccount() {
    openDeleteAccountDialog(async (password) => {
      const { remaining } = await api.deleteAccount(password);
      clearCache();
      window.location.href = remaining?.length ? "/" : "/login";
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
      if (biometricOn) {
        removeBiometric();
        biometricOn = false;
      }
      render();
    });
  }

  async function toggleBiometric(want) {
    if (want) {
      try {
        await enableBiometric(getState().user.name || getState().user.username || "Shalter");
        biometricOn = true;
      } catch (err) {
        alert(err?.message || "Не удалось включить биометрию");
      }
    } else {
      removeBiometric();
      biometricOn = false;
    }
    render();
  }

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
    const blocked = blockedUsers.filter((u) => blockedIds.has(u.id));
    const email = getState().user.email;
    let content;
    if (sub?.rule) content = renderRule(sub.rule);
    else if (sub?.blocked) content = renderBlocked(blocked);
    else if (sub?.passkeys) content = renderPasskeys();
    else {
      content = [
        twSection("Безопасность", [
          twRow({
            icon: "User",
            color: "red",
            title: "Заблокированные",
            titleRight: blocked.length ? String(blocked.length) : null,
            subtitle: blocked.length ? null : "Нет",
            onClick: () => openSub({ title: "Заблокированные", blocked: true }),
          }),
          twRow({
            icon: "Lock",
            color: "blue",
            title: "Код-пароль",
            titleRight: passcodeOn ? "Вкл." : "Выкл.",
            subtitle: "Локальный PIN на этом устройстве",
            onClick: () =>
              passcodeOn
                ? openChoiceDialog("Код-пароль", [
                    { label: "Изменить код-пароль", onClick: changePasscode },
                    { label: "Отключить код-пароль", danger: true, onClick: disablePasscode },
                  ])
                : changePasscode(),
          }),
          twRow({
            icon: "Shield",
            color: "green",
            title: "Двухэтапная аутентификация",
            titleRight: twoFactor.enabled ? "Вкл." : "Выкл.",
            subtitle: twoFactor.enabled
              ? twoFactor.method === "password"
                ? `Облачный пароль${twoFactor.cloudPasswordHint ? ` · подсказка: ${twoFactor.cloudPasswordHint}` : ""}`
                : `${twoFactor.method === "chat" ? "Код в чате Shalter" : "Приложение-аутентификатор"} · кодов восстановления: ${twoFactor.recoveryCodesLeft}`
              : "Код при каждом входе",
            onClick: twoFactor.enabled ? disableTwoFactor : enableTwoFactor,
          }),
          passkeysSupported()
            ? twRow({
                icon: "Key",
                color: "orange",
                title: "Ключи доступа",
                titleRight: passkeyList.length ? String(passkeyList.length) : null,
                subtitle: passkeyList.length ? null : "Вход без пароля",
                onClick: () => openSub({ title: "Ключи доступа", passkeys: true }),
              })
            : null,
          twRow({
            icon: "Key",
            color: "grey",
            title: "Пароль",
            subtitle: "При смене остальные сеансы завершаются",
            onClick: () =>
              openChangePasswordDialog(() => {
                showToast("Пароль изменён, остальные сеансы завершены");
              }),
          }),
          twRow({
            icon: "At",
            color: "purple",
            title: "Почта для входа",
            subtitle: email || "Не указана",
            onClick: () =>
              openChangeEmailDialog(email, (user) => {
                if (user) updateSelf({ email: user.email });
                showToast("Адрес почты изменён");
                render();
              }),
          }),
          biometricAvailable
            ? twRow({
                icon: "User",
                color: "green",
                title: "Face ID / отпечаток",
                subtitle: passcodeOn ? "Вместо ввода код-пароля" : "Сначала включите код-пароль",
                toggle: { checked: biometricOn, disabled: !passcodeOn, onChange: toggleBiometric },
              })
            : null,
          twRow({
            icon: "Lock",
            color: "pink",
            title: "Пароль при запуске",
            subtitle: "Спрашивать пароль каждый раз",
            toggle: {
              checked: !!settings.requirePasswordOnLaunch,
              onChange: async (v) => {
                settings = { ...settings, requirePasswordOnLaunch: v };
                render();
                await api.patchSettings({ requirePasswordOnLaunch: v });
              },
            },
          }),
        ]),
        twSection(
          "Конфиденциальность",
          RULES.map((rule) =>
            twRow({ title: rule.label, subtitle: ruleSubtitle(rule.key), onClick: () => openSub({ title: rule.label, rule }) })
          )
        ),
        twSection(
          null,
          [twButton({ icon: "Trash", text: "Удалить аккаунт", danger: true, onClick: deleteAccount })],
          "Безвозвратно удаляет аккаунт, чаты и ботов. Отменить нельзя."
        ),
      ];
    }
    mount(root, pageWrap(sub ? sub.title : "Конфиденциальность", null, content));
  }
  render();
}

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
    overlay.textContent = "";
    overlay.appendChild(dialog);
  }

  renderDialog();
  document.body.appendChild(overlay);
}

// Иконка платформы сеанса — как getSessionPlatformIcon в tweb.
function sessionPlatform(device = "") {
  const d = device.toLowerCase();
  if (/iphone|ipad|ios|mac/.test(d)) return { icon: "Phone", color: "blue" };
  if (/android/.test(d)) return { icon: "Phone", color: "green" };
  if (/windows/.test(d)) return { icon: "Monitor", color: "blue" };
  if (/linux|ubuntu/.test(d)) return { icon: "Monitor", color: "orange" };
  return { icon: "Globe", color: "purple" };
}

function sessionAppName(device = "") {
  const [app, ...rest] = device.split(",").map((x) => x.trim());
  return { app: app || "Shalter Web", system: rest.join(", ") };
}

function openSessionPopup(session, onTerminate) {
  const { app, system } = sessionAppName(session.device);
  const platform = sessionPlatform(session.device);
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  const dialog = el("div", { class: "modal-dialog tw-popup tw-session-popup" }, [
    el("button", { class: "tw-popup-close", title: "Закрыть", html: iconSvg("X", 22), onclick: close }),
    el("div", { class: "tw-session-hero" }, [
      el("span", { class: "tw-session-hero-icon", style: `background-color: ${TW_ROW_COLORS[platform.color]}`, html: iconSvg(platform.icon, 48) }),
      el("p", { class: "tw-media-title" }, app),
      el("p", { class: "tw-media-subtitle" }, session.current ? "в сети" : timeAgo(session.lastActive)),
    ]),
    twSection("Информация", [
      twRow({ title: "Приложение", right: app }),
      twRow({ title: "Система", right: system || "—" }),
      twRow({ title: "Местоположение", right: session.location || "—" }),
    ], session.location ? "Местоположение определено по IP-адресу и может быть неточным." : null),
    onTerminate
      ? twSection(null, [twButton({ icon: "X", text: "Завершить сеанс", danger: true, onClick: () => { close(); onTerminate(); } })])
      : null,
  ]);
  overlay.appendChild(dialog);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

async function renderDevices(root) {
  let { sessions } = await api.listSessions();

  function terminate(deviceId) {
    openCheckboxDialog({
      title: "Завершить сеанс?",
      text: "Устройство будет разлогинено.",
      confirmLabel: "Завершить",
      danger: true,
      onConfirm: async () => {
        await api.terminateSession(deviceId);
        sessions = sessions.filter((s) => s.deviceId !== deviceId);
        sessionsCount = String(sessions.length);
        render();
      },
    });
  }

  function terminateOthers() {
    openCheckboxDialog({
      title: "Завершить сеансы?",
      text: "Все устройства, кроме этого, будут разлогинены.",
      confirmLabel: "Завершить",
      danger: true,
      onConfirm: async () => {
        await api.terminateOtherSessions();
        sessions = sessions.filter((s) => s.current);
        sessionsCount = String(sessions.length);
        render();
      },
    });
  }

  function sessionRow(s) {
    const { app, system } = sessionAppName(s.device);
    const platform = sessionPlatform(s.device);
    return twRow({
      cls: "tw-session-row",
      icon: platform.icon,
      color: platform.color,
      title: app,
      titleRight: s.current ? null : timeAgo(s.lastActive),
      midtitle: system || "Shalter",
      subtitle: s.current ? `${s.location || ""}${s.location ? " · " : ""}в сети` : s.location,
      onClick: () => openSessionPopup(s, s.current ? null : () => terminate(s.deviceId)),
    });
  }

  function render() {
    const current = sessions.find((s) => s.current);
    const others = sessions.filter((s) => !s.current);
    mount(
      root,
      pageWrap("Устройства", null, [
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-media-sticker", html: iconSvg("Monitor", 56) }),
          el("p", { class: "tw-media-subtitle" }, "Здесь все устройства, на которых выполнен вход в ваш аккаунт Shalter."),
        ]),
        current
          ? twSection(
              "Это устройство",
              [
                sessionRow(current),
                others.length ? twButton({ icon: "X", text: "Завершить все другие сеансы", danger: true, onClick: terminateOthers }) : null,
              ],
              others.length ? "Выйти на всех устройствах, кроме этого." : null
            )
          : null,
        others.length
          ? twSection("Активные сеансы", others.map(sessionRow), "Нажмите на сеанс, чтобы посмотреть подробности или завершить его.")
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
    if (!(await askConfirm(label))) return;
    const { remaining } = await api.logout(uid);
    clearCache();
    if (remaining.length === 0) window.location.href = "/login";
    else window.location.reload();
  }
  async function logoutAll() {
    if (!(await askConfirm("Выйти из всех аккаунтов на этом устройстве?"))) return;
    await api.logout();
    clearCache();
    window.location.href = "/login";
  }

  mount(
    root,
    pageWrap("Аккаунты", null, [
      twSection(
        "Аккаунты на этом устройстве",
        [
          ...accounts.map((a) =>
            el("div", { class: `tw-row clickable tw-account-row${a.id === me.id ? " current" : ""}` }, [
              el("button", { type: "button", class: "tw-account-main", onclick: () => switchTo(a.id) }, [
                Avatar({ name: a.name || a.phone, color: a.avatarColor, image: a.avatarImage, size: 42 }),
                el("span", { class: "tw-row-body" }, [
                  el("span", { class: "tw-row-title" }, a.name || a.phone || a.email),
                  el("span", { class: "tw-row-subtitle" }, a.id === me.id ? "текущий аккаунт" : a.phone || a.email),
                ]),
                a.id === me.id ? el("span", { class: "tw-account-check", html: iconSvg("Check", 20) }) : null,
              ]),
              el("button", { class: "icon-btn", title: "Выйти из аккаунта", html: iconSvg("LogOut", 20), onclick: () => logout(a.id) }),
            ])
          ),
          twButton({ icon: "Plus", text: "Добавить аккаунт", onClick: () => (window.location.href = "/login?add=1") }),
        ],
        "Можно держать несколько аккаунтов открытыми и переключаться между ними."
      ),
      twSection(null, [
        twButton({ icon: "LogOut", text: "Выйти из текущего аккаунта", danger: true, onClick: () => logout(me.id) }),
        accounts.length > 1 ? twButton({ icon: "LogOut", text: "Выйти из всех аккаунтов", danger: true, onClick: logoutAll }) : null,
      ]),
    ])
  );
}

async function renderFolders(root) {
  const [{ folders: initialFolders, limit: folderLimit }, { chats }] = await Promise.all([api.listFolders(), api.listChats()]);
  let folders = initialFolders;
  let editing = null;
  let creating = false;
  let newName = "";
  let chatFilter = "";
  let error = null;
  const MAX_FOLDERS = folderLimit?.value ?? 10;
  const showFolderLimit = () =>
    openLimitPopup({
      icon: "Folder",
      count: folders.length,
      free: folderLimit?.free ?? 10,
      premium: folderLimit?.premium ?? 20,
      isPremium: !!folderLimit?.isPremium,
      text: folderLimit?.isPremium
        ? `У вас уже ${folders.length} папок — это максимум. Удалите ненужную, чтобы создать новую.`
        : `Можно создать не больше ${folderLimit?.free ?? 10} папок. С Shalter Premium лимит вырастет до ${folderLimit?.premium ?? 20}.`,
    });

  function sync() {
    setState({ folders });
  }
  async function guarded(fn) {
    error = null;
    try {
      await fn();
    } catch (err) {
      if (err.limit) {
        showFolderLimit();
        return;
      }
      error = err.message || "Не удалось сохранить";
      render();
    }
  }
  const chatName = (c) => (c.type === "dm" ? (c.isSaved ? "Избранное" : c.otherUser?.name ?? c.title) : c.title);
  const typeLabel = { dm: "личный", bot: "бот", group: "группа", channel: "канал" };

  function createFolder() {
    const name = newName.trim();
    if (!name) return;
    return guarded(async () => {
      const { folder } = await api.createFolder(name, []);
      folders = [...folders, folder];
      newName = "";
      creating = false;
      editing = folder;
      sync();
      render();
    });
  }
  function toggleChat(folder, chatId) {
    const chatIds = folder.chatIds.includes(chatId) ? folder.chatIds.filter((id) => id !== chatId) : [...folder.chatIds, chatId];
    const updated = { ...folder, chatIds };
    editing = updated;
    folders = folders.map((f) => (f.id === folder.id ? updated : f));
    sync();
    render();
    return guarded(() => api.patchFolder(folder.id, { chatIds }));
  }
  function rename(folder, raw) {
    const name = raw.trim();
    if (!name || name === folder.name) return;
    const updated = { ...folder, name };
    folders = folders.map((f) => (f.id === folder.id ? updated : f));
    if (editing?.id === folder.id) editing = updated;
    sync();
    render();
    return guarded(() => api.patchFolder(folder.id, { name }));
  }
  function move(folder, delta) {
    const i = folders.findIndex((f) => f.id === folder.id);
    const j = i + delta;
    if (j < 0 || j >= folders.length) return;
    const next = [...folders];
    [next[i], next[j]] = [next[j], next[i]];
    folders = next.map((f, idx) => ({ ...f, order: idx }));
    sync();
    render();
    return guarded(() => Promise.all(folders.map((f) => api.patchFolder(f.id, { order: f.order }))));
  }
  function remove(folder) {
    openCheckboxDialog({
      title: `Удалить папку «${folder.name}»?`,
      text: "Сами чаты останутся — пропадёт только папка.",
      confirmLabel: "Удалить",
      danger: true,
      onConfirm: () =>
        guarded(async () => {
          folders = folders.filter((f) => f.id !== folder.id);
          if (editing?.id === folder.id) editing = null;
          sync();
          render();
          await api.deleteFolder(folder.id);
        }),
    });
  }
  function shareFolder(folder) {
    return guarded(async () => {
      const { folder: updated } = await api.createFolderInviteLink(folder.id);
      folders = folders.map((f) => (f.id === folder.id ? updated : f));
      if (editing?.id === folder.id) editing = updated;
      render();
    });
  }
  function revokeFolderLink(folder) {
    return guarded(async () => {
      const { folder: updated } = await api.revokeFolderInviteLink(folder.id);
      folders = folders.map((f) => (f.id === folder.id ? updated : f));
      if (editing?.id === folder.id) editing = updated;
      render();
    });
  }

  function editorFor(folder) {
    const q = chatFilter.trim().toLowerCase();
    const list = chats
      .filter((c) => !q || chatName(c).toLowerCase().includes(q))
      .sort((a, b) => Number(folder.chatIds.includes(b.id)) - Number(folder.chatIds.includes(a.id)) || chatName(a).localeCompare(chatName(b), "ru"));
    const nameInput = el("input", {
      class: "settings-input",
      value: folder.name,
      maxlength: 32,
      placeholder: "Название папки",
      onchange: (e) => rename(folder, e.target.value),
      onkeydown: (e) => e.key === "Enter" && e.target.blur(),
    });
    const filterInput = el("input", {
      class: "settings-input",
      type: "search",
      value: chatFilter,
      placeholder: "Найти чат",
      oninput: (e) => {
        chatFilter = e.target.value;
        render();
        const again = root.querySelector(".settings-folder-filter");
        again?.focus();
        again?.setSelectionRange(chatFilter.length, chatFilter.length);
      },
    });
    filterInput.classList.add("settings-folder-filter");
    return el("div", { class: "settings-folder-editor" }, [
      el("p", { class: "settings-field-label" }, "Название"),
      nameInput,
      el("p", { class: "settings-field-label" }, `Чаты в папке — ${folder.chatIds.length}`),
      filterInput,
      el(
        "div",
        { class: "settings-folder-chat-list" },
        list.length
          ? list.map((c) =>
              el("label", { class: "settings-folder-chat-check" }, [
                el("input", { type: "checkbox", checked: folder.chatIds.includes(c.id), onchange: () => toggleChat(folder, c.id) }),
                Avatar({ name: chatName(c), color: c.otherUser?.avatarColor ?? c.avatarColor, image: c.otherUser?.avatarImage ?? c.avatarImage, size: 28 }),
                el("span", { class: "settings-folder-chat-name" }, chatName(c)),
                el("span", { class: "settings-toggle-hint" }, typeLabel[c.type] ?? ""),
              ])
            )
          : [el("p", { class: "settings-toggle-hint" }, "Ничего не найдено")]
      ),
      el("p", { class: "settings-field-label" }, "Поделиться папкой"),
      el(
        "p",
        { class: "settings-toggle-hint" },
        "В ссылку попадают только публичные чаты и каналы из этой папки — личные и закрытые группы не показываются."
      ),
      folder.inviteCode
        ? el("div", { class: "referral-code-row" }, [
            el("span", { class: "mono" }, `${window.location.origin}/folder/${folder.inviteCode}`),
            el("button", {
              class: "icon-btn",
              title: "Скопировать",
              html: iconSvg("Copy", 16),
              onclick: () => navigator.clipboard.writeText(`${window.location.origin}/folder/${folder.inviteCode}`).catch(() => {}),
            }),
            el("button", { class: "icon-btn danger", title: "Отозвать", html: iconSvg("Trash", 16), onclick: () => revokeFolderLink(folder) }),
          ])
        : el("button", { class: "btn-accent-pill", onclick: () => shareFolder(folder) }, "Создать ссылку"),
    ]);
  }

  function render() {
    const full = folders.length >= MAX_FOLDERS;
    mount(
      root,
      pageWrap("Папки с чатами", null, [
        el("div", { class: "tw-media-header" }, [
          el("span", { class: "tw-media-sticker", html: iconSvg("Folder", 56) }),
          el("p", { class: "tw-media-subtitle" }, `Создавайте папки для разных групп чатов и быстро переключайтесь между ними — мышью или клавишами Ctrl+1…9. До ${MAX_FOLDERS} папок.`),
        ]),
        !creating
          ? el("button", { class: "tw-primary-btn", onclick: () => { if (full) return showFolderLimit(); creating = true; editing = null; render(); root.querySelector(".settings-folder-create-row input")?.focus(); } }, [el("span", { html: iconSvg("Plus", 22) }), "Создать папку"])
          : null,
        error ? el("p", { class: "tw-row-note danger" }, error) : null,
        folders.length
          ? twSection(
              "Папки",
              folders.map((f, i) =>
                el("div", { class: `tw-row clickable tw-folder-row${editing?.id === f.id ? " open" : ""}` }, [
                  el("button", { type: "button", class: "tw-account-main", onclick: () => { editing = editing?.id === f.id ? null : f; chatFilter = ""; render(); } }, [
                    twRowIcon("Folder", "blue"),
                    el("span", { class: "tw-row-body" }, [
                      el("span", { class: "tw-row-title" }, f.name),
                      el("span", { class: "tw-row-subtitle" }, `${f.chatIds.length} ${plural(f.chatIds.length, "чат", "чата", "чатов")}`),
                    ]),
                  ]),
                  el("button", { class: "icon-btn", title: "Выше", disabled: i === 0, html: iconSvg("ChevronLeft", 18, "rot-up"), onclick: () => move(f, -1) }),
                  el("button", { class: "icon-btn", title: "Ниже", disabled: i === folders.length - 1, html: iconSvg("ChevronLeft", 18, "rot-down"), onclick: () => move(f, 1) }),
                  el("button", { class: "icon-btn danger", title: "Удалить папку", html: iconSvg("Trash", 18), onclick: () => remove(f) }),
                ])
              ),
              "Нажмите на папку, чтобы выбрать, какие чаты в неё входят."
            )
          : null,
        editing ? editorFor(editing) : null,
        creating
          ? el("div", { class: "settings-folder-create-row" }, [
              el("input", {
                class: "settings-input",
                autofocus: true,
                maxlength: 32,
                value: newName,
                placeholder: "Название папки",
                oninput: (e) => (newName = e.target.value),
                onkeydown: (e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") {
                    creating = false;
                    newName = "";
                    render();
                  }
                },
              }),
              el("button", { class: "btn-accent", onclick: createFolder }, "Создать"),
            ])
          : full
            ? el("p", { class: "tw-row-note" }, `Папок уже ${MAX_FOLDERS} — чтобы завести новую, удалите одну из них.`)
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
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
  if (bytes < 1024 * 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} ТБ`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024 / 1024).toFixed(2)} ПБ`;
}

async function renderData(root) {
  const { settings: initial } = await api.getSettings();
  let settings = initial;
  let usage = null;
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
    const res = await api.patchSettings(p);
    if (res?.settings) setState({ settings: res.settings });
  }

  const BUCKETS = [
    { key: "photos", label: "Фото", icon: "Image", color: "orange" },
    { key: "videos", label: "Видео", icon: "Video", color: "blue" },
    { key: "files", label: "Файлы", icon: "File", color: "green" },
    { key: "voice", label: "Голосовые", icon: "Mic", color: "purple" },
  ];

  function render() {
    const total = usage ? Object.values(usage.bytesByBucket).reduce((a, b) => a + b, 0) : 0;
    const size = (v) => (usageError ? "—" : usage ? formatBytes(v ?? 0) : "Считаем…");
    mount(
      root,
      pageWrap("Данные и память", null, [
        twSection(
          "Использование памяти",
          [
            twRow({ title: "Вложения в переписке", subtitle: usageError || size(total) }),
            ...BUCKETS.map((b) =>
              twRow({ icon: b.icon, color: b.color, title: b.label, subtitle: size(usage?.bytesByBucket[b.key]) })
            ),
          ],
          "Реальный объём фото, видео, файлов и голосовых, которые вы отправили в чаты."
        ),
        twSection(
          "Автозагрузка медиа",
          [
            twRow({
              title: "Автозагрузка медиа",
              toggle: { checked: settings.autoDownload, onChange: (v) => patch({ autoDownload: v }) },
            }),
          ],
          "Если выключено, фото и видео загружаются только по нажатию."
        ),
        twSection(
          "Голосовые сообщения",
          [
            twRow({
              icon: "Mic",
              color: "red",
              title: "Расшифровка голосовых",
              toggle: { checked: !!settings.voiceTranscription, onChange: (v) => patch({ voiceTranscription: v }) },
            }),
          ],
          isSpeechSupported()
            ? "Во время записи браузер распознаёт речь, и текст уходит вместе с голосовым — собеседник откроет его кнопкой «→A». В Chrome распознавание идёт через серверы Google."
            : "Этот браузер не умеет распознавать речь — включите в Chrome, Edge или Safari."
        ),
      ])
    );
  }
  render();
}

function shortcutRow(label, keys) {
  return twRow({
    cls: "tw-shortcut-row",
    title: label,
    right: el("span", { class: "tw-kbd-group" }, keys.map((k) => el("kbd", { class: "tw-kbd" }, k))),
  });
}

async function renderShortcuts(root) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";
  mount(
    root,
    pageWrap("Горячие клавиши", null, [
      twSection("Поиск", [
        shortcutRow("Открыть поиск", [mod, "F"]),
        shortcutRow("Открыть поиск", [mod, "K"]),
        shortcutRow("Выбрать результат", ["↑", "↓"]),
        shortcutRow("Открыть выбранный", ["Enter"]),
        shortcutRow("Очистить поиск", ["Esc"]),
      ]),
      twSection("Навигация", [
        shortcutRow("Следующий чат", ["Alt", "↓"]),
        shortcutRow("Предыдущий чат", ["Alt", "↑"]),
        shortcutRow("Избранное", [mod, "0"]),
        shortcutRow("Вкладка или папка по номеру", [mod, "1…9"]),
        shortcutRow("Закрыть чат / окно", ["Esc"]),
      ]),
    ])
  );
}

async function renderModeration(root) {
  let data = null;
  let error = null;
  let lookupError = null;
  let foundChat = null;
  let chatLookupError = null;
  let chatDeleting = false;
  let mailStatus = null;
  let mailBusy = false;
  let newStatusImage = null;
  let newStatusError = null;
  const LABEL_COLORS = ["#c6403b", "#d9822e", "#e0a423", "#2f9e5a", "#1c9bd9", "#7c6fd6", "#8a5cf6", "#5a6472"];
  let newLabelColor = LABEL_COLORS[0];
  let editingLabel = null;

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

  const newLabelShort = el("input", { class: "settings-input", placeholder: "СПАМ", maxlength: 16 });
  let dirTab = "users";
  let dirItems = null;
  let dirTotal = 0;
  let dirLoading = false;
  // Выбранные в каталоге группы, каналы и боты для массового удаления.
  const dirSelected = new Map();
  let dirDeleting = false;
  let dirNotice = null;
  const dirQueryInput = el("input", {
    class: "settings-input",
    placeholder: "Поиск в каталоге (необязательно)",
    onkeydown: (e) => {
      if (e.key === "Enter") loadDirectory();
    },
  });
  async function loadDirectory() {
    dirLoading = true;
    dirSelected.clear();
    render();
    try {
      const r = await api.adminDirectory(dirTab, dirQueryInput.value.trim());
      dirItems = r.items;
      dirTotal = r.total;
    } catch {
      dirItems = [];
      dirTotal = 0;
    } finally {
      dirLoading = false;
      render();
    }
  }

  const newStatusName = el("input", { class: "settings-input", placeholder: "Название (необязательно)", maxlength: 40 });
  const newStatusFileInput = el("input", {
    type: "file",
    accept: "image/*",
    class: "hidden-input",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      newStatusError = null;
      try {
        newStatusImage = await fileToImageDataUrl(file, 96, "image/png", 0.92);
      } catch (err) {
        newStatusError = err.message || "Не удалось загрузить картинку";
      }
      render();
    },
  });

  const adReviewSlot = el("div", { class: "settings-section-group" });
  AdReviewQueue(adReviewSlot);
  const newLabelName = el("input", { class: "settings-input", placeholder: "Спам-рассылка" });
  const newLabelHint = el("input", { class: "settings-input", placeholder: "Пояснение, которое увидит собеседник" });

  async function load() {
    try {
      data = await api.adminModeration();
    } catch (err) {
      error = err.message || "Не удалось загрузить данные модерации";
    }
    render();
  }

  function openPanel(u) {
    openAdminUserPanel(u, () => load());
  }

  const DIR_TABS = [["users", "Люди"], ["groups", "Группы"], ["channels", "Каналы"], ["bots", "Боты"]];
  const KIND_WORDS = { group: ["группу", "групп"], channel: ["канал", "каналов"], bot: ["бота", "ботов"] };
  const deletable = (it) => it.kind !== "user" && !it.isSystem;

  // Удаление из каталога: одной строки или всех отмеченных, с общей причиной.
  async function deleteFromDirectory(items) {
    if (!items.length || dirDeleting) return;
    const one = items.length === 1;
    const label = one
      ? `${KIND_WORDS[items[0].kind][0]} «${items[0].title || items[0].name}»`
      : `${items.length} шт. (${[...new Set(items.map((i) => KIND_WORDS[i.kind][1]))].join(", ")})`;
    const reason = (await askText(`Удалить ${label} за нарушение правил? Это необратимо: пропадут вся переписка и файлы, у канала — и группа обсуждения.\n\nПричина — придёт владельцам и попадёт в журнал:`,
      ""))?.trim();
    if (!reason) return;
    dirDeleting = true;
    dirNotice = null;
    render();
    try {
      const { deleted, failed } = await api.adminBulkDelete(items.map((i) => ({ id: i.id, kind: i.kind })), reason);
      const gone = new Set(deleted.map((d) => d.id));
      dirItems = (dirItems ?? []).filter((i) => !gone.has(i.id));
      dirTotal = Math.max(0, dirTotal - gone.size);
      for (const id of gone) dirSelected.delete(id);
      dirNotice = {
        error: failed.length > 0,
        text: [
          deleted.length ? `Удалено: ${deleted.length}` : null,
          failed.length ? `Не удалось: ${failed.map((f) => `${f.id} — ${f.error}`).join("; ")}` : null,
        ].filter(Boolean).join(". "),
      };
    } catch (err) {
      dirNotice = { error: true, text: err.message || "Не удалось удалить" };
    } finally {
      dirDeleting = false;
      render();
    }
  }

  function dirCheckbox(it) {
    return el("input", {
      type: "checkbox",
      class: "moderation-check",
      "aria-label": `Выбрать «${it.title || it.name}»`,
      checked: dirSelected.has(it.id),
      onclick: (e) => e.stopPropagation(),
      onchange: (e) => {
        if (e.target.checked) dirSelected.set(it.id, it);
        else dirSelected.delete(it.id);
        render();
      },
    });
  }
  function dirDeleteBtn(it) {
    return el("button", {
      class: "icon-btn moderation-delete-btn",
      title: "Удалить за нарушение правил",
      disabled: dirDeleting,
      html: iconSvg("Trash", 17),
      onclick: (e) => {
        e.stopPropagation();
        deleteFromDirectory([it]);
      },
    });
  }

  function dirRow(it) {
    const row = dirRowBody(it);
    if (!deletable(it)) return row;
    return el("div", { class: `moderation-row-wrap${dirSelected.has(it.id) ? " selected" : ""}` }, [dirCheckbox(it), row, dirDeleteBtn(it)]);
  }

  function dirToolbar() {
    if (!dirItems?.some(deletable)) return null;
    const visible = dirItems.filter(deletable);
    const allOn = visible.every((i) => dirSelected.has(i.id));
    return el("div", { class: "moderation-bulk-bar" }, [
      el("label", { class: "moderation-bulk-all" }, [
        el("input", {
          type: "checkbox",
          class: "moderation-check",
          checked: allOn,
          onchange: () => {
            if (allOn) visible.forEach((i) => dirSelected.delete(i.id));
            else visible.forEach((i) => dirSelected.set(i.id, i));
            render();
          },
        }),
        dirSelected.size ? `Выбрано: ${dirSelected.size}` : "Выбрать все",
      ]),
      dirSelected.size
        ? el(
            "button",
            { class: "btn-danger-pill", disabled: dirDeleting, onclick: () => deleteFromDirectory([...dirSelected.values()]) },
            dirDeleting ? "Удаляем…" : `Удалить выбранные (${dirSelected.size})`
          )
        : null,
    ]);
  }

  function dirRowBody(it) {
    if (it.kind === "user" || it.kind === "bot") {
      return el("button", { class: "moderation-row", onclick: () => openPanel(it) }, [
        el("div", { class: "moderation-row-body" }, [
          el("p", { class: "moderation-row-name" }, [
            it.name || "—",
            it.isBanned ? el("span", { class: "admin-panel-flag danger" }, "бан") : null,
            it.kind === "bot" ? el("span", { class: "gift-admin-tag" }, "бот") : null,
          ]),
          el("p", { class: "settings-toggle-hint mono" }, [it.username ? `@${it.username}` : null, it.phone, it.email].filter(Boolean).join(" · ") || it.id),
        ]),
      ]);
    }
    return el("button", { class: "moderation-row", onclick: () => navigate(`/chat/${it.id}`) }, [
      el("div", { class: "moderation-row-body" }, [
        el("p", { class: "moderation-row-name" }, it.title || "(без названия)"),
        el("p", { class: "settings-toggle-hint mono" }, [it.username ? `@${it.username}` : null, `${it.members} участн.`].filter(Boolean).join(" · ")),
      ]),
    ]);
  }
  function directorySection() {
    return section("Каталог", [
      el(
        "div",
        { class: "search-filter-bar" },
        DIR_TABS.map(([id, name]) =>
          el("button", { class: `search-filter-chip${dirTab === id ? " active" : ""}`, onclick: () => { dirTab = id; dirItems = null; loadDirectory(); } }, name)
        )
      ),
      el("div", { class: "settings-toggle-row no-divider" }, [dirQueryInput, el("button", { class: "btn-accent", onclick: loadDirectory }, "Показать")]),
      dirNotice ? el("p", { class: dirNotice.error ? "login-error" : "settings-toggle-hint moderation-notice-ok" }, dirNotice.text) : null,
      dirLoading
        ? el("p", { class: "settings-toggle-hint" }, "Загрузка…")
        : dirItems == null
          ? el("p", { class: "settings-toggle-hint" }, "Выберите вкладку и нажмите «Показать».")
          : !dirItems.length
            ? el("p", { class: "moderation-empty" }, "Пусто")
            : el("div", {}, [
                el("p", { class: "settings-toggle-hint" }, dirTotal > dirItems.length ? `Показано ${dirItems.length} из ${dirTotal} — уточните поиск` : `Всего: ${dirTotal}`),
                dirToolbar(),
                ...dirItems.map(dirRow),
              ]),
    ]);
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

    const lookupInput = el("input", { class: "settings-input", placeholder: "@юзернейм, +7…, почта или id" });
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

    const chatLookupInput = el("input", { class: "settings-input", placeholder: "@канал, @бот, ссылка-приглашение или id" });
    async function lookupChat() {
      const q = chatLookupInput.value.trim();
      chatLookupError = null;
      foundChat = null;
      if (!q) return render();
      try {
        ({ chat: foundChat } = await api.adminLookupChat(q));
      } catch (err) {
        chatLookupError = err.message || "Группа, канал или бот не найдены";
      }
      render();
    }
    async function deleteFoundChat() {
      const c = foundChat;
      const what = c.type === "channel" ? "канал" : c.type === "bot" ? "бота" : "группу";
      const who = c.type === "bot" ? `${c.members} диалогов` : `${c.members} участников`;
      const reason = (await askText(`Удалить ${what} «${c.title}» (${who}) за нарушение правил? Это необратимо.\n\nПричина — придёт владельцу и попадёт в журнал:`, ""))?.trim();
      if (!reason) return;
      chatDeleting = true;
      render();
      try {
        if (c.type === "bot") await api.adminDeleteBot(c.id, reason);
        else await api.deleteChat(c.id, reason);
        foundChat = null;
        chatLookupError = `«${c.title}» удалён${c.type === "group" ? "а" : ""}.`;
      } catch (err) {
        chatLookupError = err.message || "Не удалось удалить";
      } finally {
        chatDeleting = false;
        render();
      }
    }

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
        section("Группа, канал или бот", [
          chatLookupInput,
          el("button", { class: "btn-accent", onclick: lookupChat }, "Найти"),
          chatLookupError ? el("p", { class: foundChat ? "login-error" : "settings-toggle-hint" }, chatLookupError) : null,
          foundChat
            ? el("div", { class: "settings-notice-box" }, [
                el("p", { class: "settings-toggle-title" }, `${{ channel: "Канал", bot: "Бот" }[foundChat.type] ?? "Группа"} «${foundChat.title}»`),
                el(
                  "p",
                  { class: "settings-toggle-hint" },
                  [
                    foundChat.username ? `@${foundChat.username}` : null,
                    foundChat.type === "bot" ? `${foundChat.members} диалогов` : `${foundChat.members} участников`,
                    foundChat.owner ? `владелец — ${foundChat.owner.name}${foundChat.owner.username ? ` (@${foundChat.owner.username})` : ""}` : null,
                  ].filter(Boolean).join(" · ")
                ),
                el("button", { class: "settings-danger-link", disabled: chatDeleting, onclick: deleteFoundChat }, chatDeleting ? "Удаляем…" : "Удалить за нарушение правил"),
              ])
            : null,
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Сообщения, файлы, ссылки и истории удаляются прямо в чате или в просмотре истории — модератору там доступно «Удалить у всех»."
          ),
        ]),
        directorySection(),
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
        section("Метки безопасности", [
          ...(data.labels ?? []).map((l) => {
            if (editingLabel && editingLabel.id === l.id) {
              const shortI = el("input", { class: "settings-input", value: editingLabel.short, maxlength: 16, oninput: (e) => (editingLabel.short = e.target.value) });
              const nameI = el("input", { class: "settings-input", value: editingLabel.label, oninput: (e) => (editingLabel.label = e.target.value) });
              const hintI = el("input", { class: "settings-input", value: editingLabel.hint, oninput: (e) => (editingLabel.hint = e.target.value) });
              return el("div", { class: "settings-notice-box" }, [
                el("p", { class: "settings-field-label" }, "Изменить метку"),
                shortI,
                nameI,
                hintI,
                el(
                  "div",
                  { class: "avatar-color-grid" },
                  LABEL_COLORS.map((c) =>
                    el("button", { class: `avatar-color-swatch${editingLabel.color === c ? " active" : ""}`, style: `background:${c}`, onclick: () => { editingLabel.color = c; render(); } })
                  )
                ),
                el("div", { class: "settings-toggle-row no-divider" }, [
                  el("button", {
                    class: "btn-accent",
                    onclick: async () => {
                      lookupError = null;
                      try {
                        await api.adminUpdateLabel(l.id, { short: editingLabel.short, label: editingLabel.label, hint: editingLabel.hint, color: editingLabel.color });
                        editingLabel = null;
                        await load();
                      } catch (err) {
                        lookupError = err.message || "Не удалось сохранить метку";
                        render();
                      }
                    },
                  }, "Сохранить"),
                  el("button", { class: "settings-danger-link", onclick: () => { editingLabel = null; render(); } }, "Отмена"),
                ]),
              ]);
            }
            return el("div", { class: "settings-toggle-row" }, [
              el("div", {}, [
                el("p", { class: "settings-toggle-title" }, [
                  el("span", { class: "safety-badge safety-mini", style: { background: l.color || "var(--color-danger)", color: "#fff" } }, l.short),
                  ` ${l.label}`,
                ]),
                el("p", { class: "settings-toggle-hint" }, l.hint || "—"),
              ]),
              el("div", { class: "label-row-actions" }, [
                el("button", {
                  class: "settings-danger-link",
                  onclick: () => {
                    editingLabel = { id: l.id, short: l.short, label: l.label, hint: l.hint || "", color: l.color || LABEL_COLORS[0] };
                    render();
                  },
                }, "Изменить"),
                el("button", {
                  class: "settings-danger-link",
                  onclick: async () => {
                    if (!(await askConfirm(`Удалить метку «${l.label}»? Она снимется со всех, кому поставлена.`))) return;
                    await api.adminDeleteLabel(l.id);
                    await load();
                  },
                }, "Удалить"),
              ]),
            ]);
          }),
          el("p", { class: "settings-field-label" }, "Новая метка"),
          newLabelShort,
          newLabelName,
          newLabelHint,
          el("p", { class: "settings-field-label" }, "Цвет метки"),
          el(
            "div",
            { class: "avatar-color-grid" },
            LABEL_COLORS.map((c) =>
              el("button", {
                class: `avatar-color-swatch${newLabelColor === c ? " active" : ""}`,
                style: `background:${c}`,
                title: "Выбрать цвет",
                onclick: () => {
                  newLabelColor = c;
                  render();
                },
              })
            )
          ),
          el("p", { class: "settings-toggle-hint" }, [
            "Так метка будет выглядеть: ",
            el("span", { class: "safety-badge safety-mini", style: { background: newLabelColor, color: "#fff" } }, (newLabelShort.value || "МЕТКА").toUpperCase()),
          ]),
          el("button", {
            class: "btn-accent",
            onclick: async () => {
              lookupError = null;
              try {
                await api.adminCreateLabel({
                  id: newLabelShort.value,
                  short: newLabelShort.value,
                  label: newLabelName.value,
                  hint: newLabelHint.value,
                  color: newLabelColor,
                });
                newLabelShort.value = newLabelName.value = newLabelHint.value = "";
                newLabelColor = LABEL_COLORS[0];
                await load();
              } catch (err) {
                lookupError = err.message || "Не удалось создать метку";
                render();
              }
            },
          }, "Добавить метку"),
          el("p", { class: "settings-toggle-hint" }, "Короткая надпись — то, что видно рядом с именем (СКАМ, ФЕЙК). Латиницей задавать не нужно: идентификатор соберётся сам."),
        ]),
        section("Готовые статусы", [
          el("div", { class: "sticker-pack-grid" },
            (data.statusCatalog ?? []).length
              ? data.statusCatalog.map((s) =>
                  el("div", { class: "sticker-pack-cell status-cell-wrap" }, [
                    el("img", { class: "status-cell-img", src: s.image, alt: "", title: s.name || "" }),
                    el(
                      "button",
                      {
                        class: "sticker-pack-remove",
                        title: "Удалить",
                        onclick: async () => {
                          if (!(await askConfirm(`Удалить статус «${s.name || "без названия"}»? У тех, кто уже его выбрал, он останется.`))) return;
                          await api.adminDeleteStatusCatalogItem(s.id);
                          await load();
                        },
                      },
                      [el("span", { html: iconSvg("X", 10) })]
                    ),
                  ])
                )
              : [empty("Каталог пуст")]
          ),
          newStatusImage
            ? el("img", { class: "status-cell-img", src: newStatusImage, alt: "", style: { width: "40px", height: "40px" } })
            : null,
          el("button", { class: "profile-action-btn", onclick: () => newStatusFileInput.click() }, newStatusImage ? "Заменить картинку" : "Загрузить картинку"),
          newStatusFileInput,
          newStatusName,
          newStatusError ? el("p", { class: "login-error" }, newStatusError) : null,
          el(
            "button",
            {
              class: "btn-accent",
              onclick: async () => {
                if (!newStatusImage) {
                  newStatusError = "Сначала выберите картинку";
                  return render();
                }
                newStatusError = null;
                try {
                  await api.adminCreateStatusCatalogItem({ image: newStatusImage, name: newStatusName.value });
                  newStatusImage = null;
                  newStatusName.value = "";
                  await load();
                } catch (err) {
                  newStatusError = err.message || "Не удалось добавить статус";
                  render();
                }
              },
            },
            "Добавить в каталог"
          ),
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
        adReviewSlot,
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

function formatUptime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин ${s % 60} с`;
  return `${s} с`;
}

function meter(label, percent, valueText, hint) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const level = p >= 90 ? "danger" : p >= 75 ? "warn" : "ok";
  return el("div", { class: "server-meter" }, [
    el("div", { class: "server-meter-head" }, [
      el("span", { class: "server-meter-label" }, label),
      el("span", { class: `mono server-meter-value ${level}` }, `${p.toFixed(p < 10 ? 1 : 0)}%`),
    ]),
    el("div", { class: "server-meter-track" }, [el("div", { class: `server-meter-fill ${level}`, style: { width: `${p}%` } })]),
    valueText ? el("p", { class: "mono server-meter-sub" }, valueText) : null,
    hint ? el("p", { class: "settings-toggle-hint" }, hint) : null,
  ]);
}

function statRow(label, value) {
  return el("div", { class: "server-stat-row" }, [el("span", {}, label), el("span", { class: "mono settings-toggle-hint" }, value)]);
}

async function renderServer(root) {
  let data = null;
  let error = null;
  let busy = false;
  const REFRESH_MS = 5000;
  let auto = true;
  const TABLES_SHOWN = 12;
  let allTables = false;

  async function load() {
    busy = true;
    try {
      data = await api.adminServerStats();
      error = null;
    } catch (err) {
      error = err.message || "Не удалось получить состояние сервера";
    }
    busy = false;
    render();
  }

  const iv = setInterval(() => {
    if (!document.body.contains(root)) {
      clearInterval(iv);
      return;
    }
    if (auto && !busy) load();
  }, REFRESH_MS);

  function render() {
    clear(root);
    if (error && !data) {
      mount(root, pageWrap("Состояние сервера", null, [el("p", { class: "login-error" }, error)]));
      return;
    }
    if (!data) {
      mount(root, pageWrap("Состояние сервера", null, [el("p", { class: "settings-toggle-hint" }, "Считаем…")]));
      return;
    }

    const { host, cpu, memory, disk, storage, db, realtime } = data;
    const proc = data.process;

    const toolbar = el("div", { class: "server-toolbar" }, [
      el("span", { class: "mono settings-toggle-hint" }, `Обновлено в ${new Date(data.at).toLocaleTimeString("ru-RU")}`),
      el("div", { class: "server-toolbar-actions" }, [
        el("label", { class: "server-auto" }, [
          el("input", {
            type: "checkbox",
            checked: auto,
            onchange: (e) => {
              auto = e.target.checked;
            },
          }),
          el("span", {}, "каждые 5 с"),
        ]),
        el("button", { class: "profile-action-btn server-refresh-btn", disabled: busy, onclick: load }, busy ? "…" : "Обновить"),
      ]),
    ]);

    mount(
      root,
      pageWrap("Состояние сервера", "Диск, процессор и память машины, на которой работает Shalter. Только чтение.", [
        toolbar,
        error ? el("p", { class: "login-error" }, error) : null,
        section("Нагрузка", [
          meter(
            "Процессор",
            cpu.usagePercent,
            `${host.cores} ядер · ${host.cpuModel}`,
            cpu.loadAvg
              ? `Средняя нагрузка: ${cpu.loadAvg.map((v) => v.toFixed(2)).join(" · ")} (1 / 5 / 15 мин). Больше числа ядер (${host.cores}) — очередь на выполнение, сервер не успевает.`
              : null
          ),
          cpu.perCore?.length
            ? el(
                "div",
                { class: "server-cores" },
                cpu.perCore.map((p, i) =>
                  el("div", { class: "server-core", title: `Ядро ${i + 1}: ${p.toFixed(0)}%` }, [
                    el("div", {
                      class: `server-core-fill ${p >= 90 ? "danger" : p >= 75 ? "warn" : "ok"}`,
                      style: { height: `${Math.max(2, p)}%` },
                    }),
                  ])
                )
              )
            : null,
          meter(
            "Оперативная память",
            memory.usedPercent,
            `${formatBytes(memory.used)} из ${formatBytes(memory.total)} · свободно ${formatBytes(memory.free)}`,
            null
          ),
        ]),
        section("Диск", [
          disk.error
            ? el("p", { class: "login-error" }, `Не удалось прочитать раздел: ${disk.error}`)
            : meter(
                "Раздел с данными",
                disk.usedPercent,
                `${formatBytes(disk.used)} занято · ${formatBytes(disk.free)} свободно из ${formatBytes(disk.total)}`,
                disk.usedPercent >= 90
                  ? "Места почти нет — загрузка вложений начнёт падать с ошибкой, а база перестанет писать."
                  : `Раздел, где лежит ${disk.path}`
              ),
          statRow("База data/app.db", formatBytes(storage.db)),
          statRow("Журнал WAL", `${formatBytes(storage.wal)}${storage.wal > 64 * 1024 * 1024 ? " — необычно много" : ""}`),
          statRow(
            "Вложения",
            storage.uploadsInS3
              ? "хранятся в S3 — размер считает само хранилище"
              : `${formatBytes(storage.uploads)} · ${storage.uploadFiles} ${storage.uploadsTruncated ? "файлов (посчитаны не все)" : "файлов"}`
          ),
          statRow("Всего данных Shalter", formatBytes(storage.total)),
        ]),
        section("База данных", [
          statRow("Размер по страницам", `${formatBytes(db.pageCount * db.pageSize)} · ${db.pageCount} × ${formatBytes(db.pageSize)}`),
          db.freeBytes > 0 ? statRow("Свободно внутри базы", `${formatBytes(db.freeBytes)} — вернёт VACUUM`) : null,
          statRow("Всего строк", String(db.totalRows)),
          ...db.tables.slice(0, allTables ? db.tables.length : TABLES_SHOWN).map((t) => statRow(t.name, String(t.rows))),
          db.tables.length > TABLES_SHOWN
            ? el(
                "button",
                {
                  class: "profile-action-btn moderation-open-btn",
                  onclick: () => {
                    allTables = !allTables;
                    render();
                  },
                },
                allTables ? "Свернуть" : `Показать все таблицы (${db.tables.length})`
              )
            : null,
        ]),
        section("Процесс Shalter", [
          statRow("Работает", formatUptime(proc.uptimeSec)),
          statRow("Память процесса (RSS)", `${formatBytes(proc.rss)} · ${proc.sharePercent.toFixed(1)}% от всей памяти`),
          statRow("Куча V8", `${formatBytes(proc.heapUsed)} из ${formatBytes(proc.heapTotal)}`),
          statRow("PID", String(proc.pid)),
          statRow("Пользователей в сети", `${realtime.onlineUsers}`),
          statRow("Открытых соединений", `${realtime.sockets} (вкладки и устройства)`),
        ]),
        section("Машина", [
          statRow("Имя", host.hostname),
          statRow("Система", `${host.platform} · ${host.arch}`),
          statRow("Node.js", host.node),
          statRow("Аптайм", formatUptime(host.uptimeSec)),
        ]),
      ])
    );
  }

  render();
  await load();
}

async function renderStars(root) {
  setPanelTitle("Звёзды");
  mount(root, el("div", { class: "settings-page tw-page" }, [StarsPanel()]));
}

async function renderUsernames(root) {
  let data = null;
  let error = null;
  let notice = null;
  let busy = false;

  let market = null;

  async function load() {
    try {
      data = await api.listUsernameAuctions();
      market = await api.listUsernameMarket();
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
      market = await api.listUsernameMarket();
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
                onclick: async () => {
                  if ((await askConfirm(`Отменить аукцион @${a.username}? Ставки аннулируются, звёзды не списывались.`))) {
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

        section("Рынок юзернеймов", [
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Хендлы, которые продают их владельцы. Покупка мгновенная: звёзды уходят продавцу, юзернейм — вам."
          ),
          ...(market?.listings?.length
            ? market.listings.map((l) =>
                el("div", { class: "auction-card" }, [
                  el("div", { class: "auction-head" }, [
                    el("span", { class: "mono auction-name" }, `@${l.username}`),
                    el("span", { class: "auction-status" }, `${l.priceStars} ⭐`),
                  ]),
                  el("p", { class: "settings-toggle-hint" }, l.mine ? "Ваше объявление" : `Продавец: ${l.seller?.name ?? "—"}`),
                  l.mine
                    ? el(
                        "button",
                        { class: "settings-danger-link", disabled: busy, onclick: () => act(() => api.withdrawUsernameListing(l.id), "Объявление снято") },
                        "Снять с продажи"
                      )
                    : el(
                        "button",
                        {
                          class: "btn-accent",
                          disabled: busy || (market.balance ?? 0) < l.priceStars,
                          onclick: () => act(() => api.buyUsername(l.id), `@${l.username} теперь ваш`),
                        },
                        (market.balance ?? 0) < l.priceStars ? `Не хватает ${l.priceStars - (market.balance ?? 0)} ⭐` : `Купить за ${l.priceStars} ⭐`
                      ),
                ])
              )
            : [el("p", { class: "empty-hint" }, "Пока никто ничего не продаёт")]),
          el("p", { class: "settings-section-title" }, "Продать свой"),
          el(
            "p",
            { class: "settings-toggle-hint" },
            "Продаётся тот юзернейм, который на вас сейчас. После покупки он перейдёт покупателю, а вы сможете занять новый."
          ),
          (() => {
            const priceEl = el("input", { class: "settings-input mono", type: "number", min: "10", placeholder: "Цена, ⭐" });
            return el("div", { class: "contacts-phone-row" }, [
              priceEl,
              el(
                "button",
                { class: "btn-accent", disabled: busy, onclick: () => act(() => api.sellUsername(Number(priceEl.value)), "Объявление размещено") },
                "Выставить"
              ),
            ]);
          })(),
        ]),

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
  let uploadingGif = false;
  const draft = { emoji: "", name: "", priceStars: "", supply: "", exclusive: true, forever: true, gifFile: null, gifPreviewUrl: null, scene: null };

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
      let gifUrl;
      if (draft.gifFile) {
        uploadingGif = true;
        render();
        const uploaded = await uploadFile(draft.gifFile, "gift");
        gifUrl = uploaded.url;
      }
      const { gift } = await api.adminCreateGift({
        emoji: draft.emoji,
        name: draft.name,
        priceStars: Number(draft.priceStars),
        premiumDays: draft.forever ? null : 0,
        supply: draft.exclusive ? Number(draft.supply) : null,
        exclusive: draft.exclusive,
        gifUrl,
        scene: draft.scene || undefined,
      });
      notice = `Выпущен подарок ${gift.emoji} «${gift.name}»`;
      draft.emoji = "";
      draft.name = "";
      draft.priceStars = "";
      draft.supply = "";
      draft.scene = null;
      if (draft.gifPreviewUrl) URL.revokeObjectURL(draft.gifPreviewUrl);
      draft.gifFile = null;
      draft.gifPreviewUrl = null;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось создать подарок";
    } finally {
      uploadingGif = false;
    }
    render();
  }

  async function removeGift(gift) {
    error = null;
    notice = null;
    const canHardDelete = gift.custom && !gift.ownerId && (gift.issued ?? 0) === 0;
    if (!canHardDelete && !(await askConfirm(`Скрыть «${gift.name}» из витрины? Уже подаренные экземпляры останутся у людей. Подарок можно вернуть.`))) return;
    try {
      const res = await api.adminDeleteGift(gift.id);
      notice = res.hidden ? `Подарок «${gift.name}» скрыт из витрины` : `Подарок «${gift.name}» удалён`;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось удалить";
    }
    render();
  }

  async function restoreGift(gift) {
    error = null;
    notice = null;
    try {
      await api.adminRestoreGift(gift.id);
      notice = `Подарок «${gift.name}» возвращён в витрину`;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось восстановить";
    }
    render();
  }

  function editGiftScene(gift) {
    openAnimatorEditor({
      title: `Нарисовать «${gift.name}»`,
      saveLabel: "Сохранить рисунок",
      initial: gift.scene,
      onSave: async (scene) => {
        error = null;
        notice = null;
        try {
          await api.adminSetGiftScene(gift.id, scene);
          notice = `Рисунок «${gift.name}» обновлён`;
          data = await api.adminGiftCatalog();
        } catch (err) {
          error = err.message || "Не удалось сохранить рисунок";
        }
        render();
      },
    });
  }

  async function clearGiftScene(gift) {
    error = null;
    notice = null;
    try {
      await api.adminSetGiftScene(gift.id, null);
      notice = `Рисунок «${gift.name}» убран`;
      data = await api.adminGiftCatalog();
    } catch (err) {
      error = err.message || "Не удалось убрать рисунок";
    }
    render();
  }

  function giftRow(gift) {
    return el("div", { class: `gift-admin-row ${gift.hidden ? "gift-admin-hidden" : ""}` }, [
      el("span", { class: "gift-admin-emoji" }, [renderGiftArt(gift, { size: 40, replay: false })]),
      el("div", { class: "gift-admin-body" }, [
        el("p", { class: "gift-admin-name" }, [
          gift.name,
          gift.custom && !gift.ownerId ? el("span", { class: "gift-admin-tag" }, "свой") : el("span", { class: "gift-admin-tag" }, "встроенный"),
          gift.scene ? el("span", { class: "gift-admin-tag" }, "рисунок") : null,
          gift.hidden ? el("span", { class: "gift-admin-tag" }, "скрыт") : null,
        ]),
        el("p", { class: "gift-admin-sub mono" }, `⭐ ${fmt(gift.priceStars)}${gift.supply ? ` · тираж ${fmt(gift.supply)}` : " · без тиража"}`),
      ]),
      el("button", { class: "icon-btn", title: gift.scene ? "Изменить рисунок" : "Нарисовать", html: iconSvg("Edit", 15), onclick: () => editGiftScene(gift) }),
      gift.scene ? el("button", { class: "icon-btn", title: "Убрать рисунок", onclick: () => clearGiftScene(gift) }, "↺") : null,
      gift.hidden
        ? el("button", { class: "btn-accent-pill", title: "Вернуть в витрину", onclick: () => restoreGift(gift) }, "Вернуть")
        : el("button", {
            class: "icon-btn danger",
            title: gift.custom && !gift.ownerId && (gift.issued ?? 0) === 0 ? "Удалить" : "Скрыть из витрины",
            html: iconSvg("Trash", 15),
            onclick: () => removeGift(gift),
          }),
    ].filter(Boolean));
  }

  function supplyRow(gift) {
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
    const emojiInput = el("input", { class: "settings-input gift-emoji-input", placeholder: "🎁", value: draft.emoji, oninput: (e) => { draft.emoji = e.target.value; render(); } });
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
    const gifInput = el("input", {
      type: "file",
      accept: "image/gif,video/*",
      class: "hidden-input",
      onchange: (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (draft.gifPreviewUrl) URL.revokeObjectURL(draft.gifPreviewUrl);
        draft.gifFile = file;
        draft.gifPreviewUrl = URL.createObjectURL(file);
        render();
      },
    });
    const gifPicker = el("div", { class: "gift-create-gif-picker" }, [
      draft.scene
        ? el("div", { class: "gift-create-anim-preview" }, [renderGiftArt({ scene: draft.scene }, { size: 72 })])
        : draft.gifPreviewUrl
          ? el("img", { src: draft.gifPreviewUrl, class: "gift-create-gif-preview" })
          : (draft.emoji ? el("div", { class: "gift-create-anim-preview" }, [renderGiftArt({ emoji: draft.emoji }, { size: 72 })]) : null),
      el(
        "button",
        {
          class: "btn-accent-pill",
          type: "button",
          onclick: () =>
            openAnimatorEditor({
              title: "Нарисовать подарок",
              saveLabel: "Готово",
              initial: draft.scene,
              onSave: (scene) => {
                draft.scene = scene;
                render();
              },
            }),
        },
        draft.scene ? "Изменить рисунок" : "✏️ Нарисовать анимацию"
      ),
      draft.scene
        ? el("button", { class: "settings-danger-link", type: "button", onclick: () => { draft.scene = null; render(); } }, "Убрать рисунок")
        : null,
      el(
        "button",
        { class: "btn-accent-pill", type: "button", disabled: uploadingGif, onclick: () => gifInput.click() },
        draft.gifFile ? "Заменить гифку" : "Загрузить гифку (необязательно)"
      ),
      draft.gifFile
        ? el("button", { class: "settings-danger-link", type: "button", onclick: () => { if (draft.gifPreviewUrl) URL.revokeObjectURL(draft.gifPreviewUrl); draft.gifFile = null; draft.gifPreviewUrl = null; render(); } }, "Убрать гифку — встроенная анимация")
        : el("p", { class: "settings-toggle-hint" }, "Без гифки и рисунка подарок анимируется встроенной анимацией по эмодзи."),
      gifInput,
    ].filter(Boolean));

    mount(
      root,
      pageWrap("Каталог подарков", "Тиражи эксклюзивов и выпуск новых подарков", [
        notice ? el("p", { class: "admin-panel-notice" }, `✅ ${notice}`) : null,
        error ? el("p", { class: "login-error" }, error) : null,

        section("Выпустить новый подарок", [
          el("div", { class: "gift-create-grid" }, [emojiInput, nameInput, priceInput, supplyInput]),
          gifPicker,
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
          el("button", { class: "btn-accent", disabled: uploadingGif, onclick: createGift }, uploadingGif ? "Загружаем гифку…" : "Выпустить"),
        ]),

        section(`Все подарки (${data.gifts.length})`, data.gifts.map(giftRow)),

        section(`Тиражи (${limited.length})`, limited.length ? limited.map(supplyRow) : [el("p", { class: "moderation-empty" }, "Ограниченных подарков нет")]),
      ])
    );
  }

  render();
  await load();
}

async function renderLegal(root) {
  let target = null;
  let lookupError = null;
  let exportError = null;
  let busy = false;
  let lastExport = null;
  let log = [];

  const queryInput = el("input", { class: "settings-input", placeholder: "@username, +7… или id пользователя" });
  const reasonInput = el("input", { class: "settings-input", placeholder: "Основание: № дела / реквизиты постановления" });

  try {
    ({ exports: log } = await api.adminListExports());
  } catch (err) {
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

// Настройки → Цены и тарифы: тарифы Premium и бизнеса, наборы звёзд, кабинет
// рекламы и стоимость действий за звёзды. Уже созданные заказы оплачиваются по
// старой цене — сервер запоминает её в самом заказе.
async function renderPricing(root) {
  let data = null;
  let loadError = null;
  try {
    data = await api.adminGetPricing();
  } catch (err) {
    loadError = err.message;
  }
  if (!data) {
    mount(root, pageWrap("Цены и тарифы", null, [el("p", { class: "login-error" }, loadError || "Не удалось загрузить цены")]));
    return;
  }

  const draft = structuredClone(data.pricing);
  let saving = false;
  let message = null;

  const num = (value, oninput, attrs = {}) =>
    el("input", { class: "settings-input mono", type: "number", min: 0, value: String(value ?? ""), oninput: (e) => oninput(e.target.value), ...attrs });
  const text = (value, oninput, placeholder) =>
    el("input", { class: "settings-input", type: "text", maxlength: 40, placeholder, value: value ?? "", oninput: (e) => oninput(e.target.value) });
  const removeBtn = (onclick) => el("button", { class: "btn-secondary pricing-remove", type: "button", title: "Удалить", onclick }, "✕");
  const head = (labels, cls = "") => el("div", { class: `pricing-row pricing-head ${cls}` }, labels.map((l) => el("span", {}, l)));

  function planEditor(key, title) {
    const list = draft[key];
    return section(title, [
      head(["Название", "Дней", "₽", ""]),
      ...list.map((p, i) =>
        el("div", { class: "pricing-row" }, [
          text(p.label, (v) => (p.label = v), "1 месяц"),
          num(p.days, (v) => (p.days = Number(v)), { min: 1 }),
          num(p.priceRub, (v) => (p.priceRub = Number(v)), { min: 1 }),
          removeBtn(() => {
            list.splice(i, 1);
            render();
          }),
        ])
      ),
      el(
        "button",
        {
          class: "btn-secondary",
          type: "button",
          onclick: () => {
            list.push({ id: `p${Date.now().toString(36)}`, label: "", days: 30, priceRub: 100 });
            render();
          },
        },
        "+ Добавить тариф"
      ),
    ]);
  }

  async function save() {
    saving = true;
    message = null;
    render();
    try {
      const res = await api.adminUpdatePricing(draft);
      Object.assign(draft, structuredClone(res.pricing));
      message = { ok: true, text: "Сохранено. Новые цены уже действуют." };
    } catch (err) {
      message = { ok: false, text: err.message || "Не удалось сохранить" };
    }
    saving = false;
    render();
  }

  async function reset() {
    if (!(await askConfirm("Вернуть все цены к значениям по умолчанию?"))) return;
    try {
      const res = await api.adminResetPricing();
      for (const k of Object.keys(draft)) delete draft[k];
      Object.assign(draft, structuredClone(res.pricing));
      message = { ok: true, text: "Цены сброшены." };
    } catch (err) {
      message = { ok: false, text: err.message || "Не удалось сбросить" };
    }
    render();
  }

  function render() {
    mount(
      root,
      pageWrap("Цены и тарифы", "Меняются сразу для всех. Уже выставленные счета оплачиваются по прежней цене.", [
        planEditor("premiumPlans", "Shalter Premium"),
        planEditor("businessPlans", "Shalter для бизнеса"),
        section("Наборы звёзд", [
          head(["Звёзд", "₽", ""], "pricing-row-3"),
          ...draft.starPacks.map((p, i) =>
            el("div", { class: "pricing-row pricing-row-3" }, [
              num(p.stars, (v) => (p.stars = Number(v)), { min: 1 }),
              num(p.priceRub, (v) => (p.priceRub = Number(v)), { min: 1 }),
              removeBtn(() => {
                draft.starPacks.splice(i, 1);
                render();
              }),
            ])
          ),
          el(
            "button",
            {
              class: "btn-secondary",
              type: "button",
              onclick: () => {
                draft.starPacks.push({ id: `stars_${Date.now().toString(36)}`, stars: 100, priceRub: 200 });
                render();
              },
            },
            "+ Добавить набор"
          ),
        ]),
        section("Кабинет рекламы", [
          head(["Дней", "₽"], "pricing-row-2"),
          el("div", { class: "pricing-row pricing-row-2" }, [
            num(draft.ads.days, (v) => (draft.ads.days = Number(v)), { min: 1 }),
            num(draft.ads.priceRub, (v) => (draft.ads.priceRub = Number(v)), { min: 1 }),
          ]),
        ]),
        section("Звёзды", [
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-toggle-hint" }, "Рублей за одну звезду при оплате Premium звёздами"),
            num(draft.rubPerStar, (v) => (draft.rubPerStar = Number(v)), { step: "0.01", min: "0.01" }),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-toggle-hint" }, "Поднять сообщение, ⭐"),
            num(draft.starCosts.boost, (v) => (draft.starCosts.boost = Number(v))),
          ]),
          el("label", { class: "settings-field" }, [
            el("span", { class: "settings-toggle-hint" }, "Удалить чужое сообщение, ⭐"),
            num(draft.starCosts.delete, (v) => (draft.starCosts.delete = Number(v))),
          ]),
        ]),
        message ? el("p", { class: message.ok ? "login-hint" : "login-error" }, message.text) : null,
        el("div", { class: "pricing-actions" }, [
          el("button", { class: "btn-accent", disabled: saving, onclick: save }, saving ? "Сохраняем…" : "Сохранить"),
          el("button", { class: "btn-secondary", type: "button", onclick: reset }, "Сбросить по умолчанию"),
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
    pageWrap("Донаты", "Реальная автоматическая оплата Premium, рекламы и подарков вместо ручного подтверждения — через DonationAlerts и/или DonatePay", [
      banner === "connected" ? el("p", { class: "login-hint" }, "✅ DonationAlerts подключён.") : null,
      banner === "error" ? el("p", { class: "login-error" }, "Не удалось подключить DonationAlerts — попробуйте ещё раз.") : null,
      loadError ? el("p", { class: "login-error" }, loadError) : null,
      status
        ? section("DonationAlerts", [
            !status.configured
              ? el("p", { class: "settings-toggle-hint" }, "На сервере не заданы DONATIONALERTS_CLIENT_ID / DONATIONALERTS_CLIENT_SECRET / DONATIONALERTS_REDIRECT_URI — без них подключение недоступно.")
              : status.connected
                ? el("p", { class: "settings-toggle-title" }, `Подключено${status.username ? ` как @${status.username}` : ""} ✅`)
                : el("a", { class: "btn-accent donation-link-btn", href: "/api/donation-alerts/connect" }, "Подключить DonationAlerts"),
          ])
        : null,
      status
        ? section("DonatePay", [
            status.donatePayConfigured
              ? el("p", { class: "settings-toggle-title" }, "Настроен ✅")
              : el(
                  "p",
                  { class: "settings-toggle-hint" },
                  "На сервере не заданы DONATEPAY_API_TOKEN / DONATEPAY_PAGE_URL — без них DonatePay недоступен (см. .env.example). В отличие от DonationAlerts, отдельного шага «Подключить» здесь нет — достаточно переменных."
                ),
          ])
        : null,
    ])
  );
}
