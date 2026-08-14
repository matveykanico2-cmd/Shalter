import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { isContactPickerSupported, pickPhoneContacts, readVCardFiles, parsePastedContacts, isIos } from "../lib/phoneContacts.js";

// "Найти друзей по контактам" — the alternative to typing an exact @handle for
// every person you already know, which was the only way to add anyone before
// (see views/contacts.js).
//
// Two lists come back: people already on Shalter (one tap to add) and people
// who aren't (one tap to invite). The invite is the existing referral link, so
// inviting someone is the same action that already earns both sides Premium —
// no second, parallel invite mechanism.
export function openImportContactsDialog(onAdded) {
  let step = "pick"; // "pick" | "loading" | "results"
  let error = null;
  let found = [];
  let notFound = [];
  let checked = 0;
  let addedIds = new Set();
  let invitedPhones = new Set();
  let inviteLink = null;
  let busyId = null;

  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const bodyEl = el("div", { class: "import-contacts-body" });
  const dialog = el("div", { class: "modal-dialog import-contacts-dialog" }, [
    el("h2", { class: "modal-title" }, "Друзья из контактов"),
    bodyEl,
    el("button", { class: "modal-cancel", onclick: () => close() }, "Закрыть"),
  ]);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  // The referral link doubles as the invite link: someone who joins through it
  // gets Premium and so does the person who invited them.
  api
    .getPremiumInfo()
    .then((info) => {
      if (info?.referralCode) inviteLink = `${window.location.origin}/login?ref=${info.referralCode}`;
    })
    .catch(() => {});

  const fileInput = el("input", {
    type: "file",
    accept: ".vcf,text/vcard,text/x-vcard",
    // iOS shares one .vcf per contact, so importing there means many files.
    multiple: true,
    class: "hidden-input",
    onchange: async (e) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = "";
      if (!files.length) return;
      try {
        const entries = await readVCardFiles(files);
        if (!entries.length) {
          error = "В файлах не нашлось ни одного номера телефона";
          step = "pick";
          render();
          return;
        }
        await match(entries);
      } catch (err) {
        error = err.message || "Не удалось прочитать файл";
        step = "pick";
        render();
      }
    },
  });

  // The path that works on every platform, iPhone included: paste or type the
  // numbers. A plain textarea read on submit — re-rendering per keystroke would
  // take the focus with it.
  const pasteInput = el("textarea", {
    class: "settings-input import-paste",
    rows: 3,
    placeholder: "+7 999 111-22-33\nМама +7 900 000 00 00",
  });

  async function matchPasted() {
    const entries = parsePastedContacts(pasteInput.value);
    if (!entries.length) {
      error = "Не нашлось ни одного номера — по одному в строке или через запятую";
      return render();
    }
    await match(entries);
  }

  async function match(entries) {
    step = "loading";
    error = null;
    render();
    try {
      // Chunked: the server caps a single request, and an address book of a few
      // thousand numbers is perfectly ordinary.
      const CHUNK = 500;
      found = [];
      notFound = [];
      checked = 0;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const res = await api.matchContacts(entries.slice(i, i + CHUNK));
        found.push(...res.found);
        notFound.push(...res.notFound);
        checked += res.checked;
      }
      step = "results";
    } catch (err) {
      error = err.message || "Не удалось проверить контакты";
      step = "pick";
    }
    render();
  }

  async function usePicker() {
    error = null;
    try {
      const entries = await pickPhoneContacts();
      if (!entries.length) return; // cancelled or nothing ticked — not an error
      await match(entries);
    } catch (err) {
      // A refused permission lands here too; the vCard route below still works.
      error = err.message || "Не удалось получить доступ к контактам";
      render();
    }
  }

  async function addContact(entry) {
    if (busyId) return;
    busyId = entry.user.id;
    render();
    try {
      await api.addContact(entry.user.id);
      addedIds.add(entry.user.id);
      onAdded?.();
    } catch (err) {
      error = err.message || "Не удалось добавить контакт";
    } finally {
      busyId = null;
      render();
    }
  }

  function inviteText() {
    return `Привет! Пишу тебе из Shalter — попробуй, там удобно.${inviteLink ? ` ${inviteLink}` : ""}`;
  }

  async function invite(entry) {
    invitedPhones.add(entry.phone);
    render();
    // navigator.share gives the native share sheet (Telegram/WhatsApp/SMS/…)
    // on a phone; sms: is the reliable fallback and is exactly right for a
    // contact you only have a number for.
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteText() });
        return;
      } catch {
        /* dismissed — fall through to the SMS link */
      }
    }
    const digits = String(entry.phone).replace(/[^\d+]/g, "");
    window.location.href = `sms:${digits}?&body=${encodeURIComponent(inviteText())}`;
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteText());
      error = null;
      renderNotice("Приглашение скопировано ✓");
    } catch {
      renderNotice("Не удалось скопировать — выделите ссылку вручную");
    }
  }

  let noticeEl = null;
  function renderNotice(text) {
    if (!noticeEl) return;
    noticeEl.textContent = text;
  }

  function personRow(entry) {
    const u = entry.user;
    const added = addedIds.has(u.id) || entry.alreadyContact;
    return el("div", { class: "import-contact-row" }, [
      Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 36, online: u.online }),
      el("div", { class: "import-contact-body" }, [
        el("p", { class: "import-contact-name" }, u.name),
        el(
          "p",
          { class: "import-contact-sub" },
          // Their name in *your* address book, when it differs from the display
          // name on the account — that's how you recognise who this actually is.
          entry.localName && entry.localName !== u.name ? `${entry.localName} · @${u.username}` : u.username ? `@${u.username}` : ""
        ),
      ]),
      added
        ? el("span", { class: "import-contact-done" }, entry.alreadyContact ? "уже в контактах" : "добавлен ✓")
        : el(
            "button",
            { class: "btn-accent-pill", disabled: busyId === u.id, onclick: () => addContact(entry) },
            busyId === u.id ? "…" : "Добавить"
          ),
    ]);
  }

  function inviteRow(entry) {
    const invited = invitedPhones.has(entry.phone);
    return el("div", { class: "import-contact-row" }, [
      el("div", { class: "import-contact-placeholder" }, [el("span", { html: iconSvg("Users", 16) })]),
      el("div", { class: "import-contact-body" }, [
        el("p", { class: "import-contact-name" }, entry.name || entry.phone),
        el("p", { class: "import-contact-sub mono" }, entry.name ? entry.phone : ""),
      ]),
      el(
        "button",
        { class: `btn-accent-pill ${invited ? "muted" : ""}`, onclick: () => invite(entry) },
        invited ? "Отправлено" : "Пригласить"
      ),
    ]);
  }

  function render() {
    clear(bodyEl);

    // Every list below is passed through .filter(Boolean) before append():
    // Element.append() stringifies a null argument into a literal "null" text
    // node (dom.js's el() drops them for you, append() does not), which is
    // exactly how two stray "null"s ended up rendered in this dialog.
    const show = (children) => bodyEl.append(...children.filter(Boolean));

    if (step === "loading") {
      show([el("div", { class: "qr-login-spinner" }), el("p", { class: "settings-toggle-hint" }, "Ищем ваших друзей…")]);
      return;
    }

    if (step === "pick") {
      show([
        el(
          "p",
          { class: "settings-toggle-hint" },
          "Найдём, кто из ваших контактов уже в Shalter, а остальных можно пригласить. Номера проверяются на сервере и нигде не сохраняются."
        ),
        isContactPickerSupported() ? el("button", { class: "btn-accent", onclick: usePicker }, "Выбрать из контактов телефона") : null,
        el("button", { class: "profile-action-btn import-vcf-btn", onclick: () => fileInput.click() }, [
          el("span", { html: iconSvg("Download", 15) }),
          " Выбрать файлы контактов (.vcf)",
        ]),
        fileInput,
        el(
          "p",
          { class: "settings-toggle-hint" },
          isContactPickerSupported()
            ? "Файл подойдёт, если хотите проверить контакты с другого устройства."
            : isIos()
              ? "На iPhone Safari не даёт странице доступ к адресной книге — это ограничение самой iOS, а не приложения. Два рабочих способа: в «Контактах» выделите людей → «Поделиться» → сохраните карточки в «Файлы» и выберите их здесь (можно сразу несколько), либо просто вставьте номера ниже."
              : "Ваш браузер не даёт странице доступ к адресной книге напрямую. Экспортируйте контакты в файл .vcf (Android: Контакты → Экспорт) и выберите его здесь — или вставьте номера ниже."
        ),
        el("p", { class: "settings-field-label" }, "Или вставьте номера"),
        pasteInput,
        el("button", { class: "profile-action-btn", onclick: matchPasted }, "Проверить эти номера"),
        error ? el("p", { class: "login-error" }, error) : null,
      ]);
      return;
    }

    // step === "results"
    noticeEl = el("p", { class: "settings-toggle-hint" }, "");
    show([
      el("p", { class: "settings-toggle-hint" }, `Проверено номеров: ${checked}`),
      error ? el("p", { class: "login-error" }, error) : null,
      el("p", { class: "settings-section-title" }, `Уже в Shalter (${found.length})`),
      found.length
        ? el("div", { class: "import-contact-list" }, found.map(personRow))
        : el("p", { class: "moderation-empty" }, "Никого из ваших контактов здесь пока нет"),
      el("p", { class: "settings-section-title" }, `Пригласить (${notFound.length})`),
      notFound.length
        ? el("div", { class: "import-contact-list" }, notFound.slice(0, 100).map(inviteRow))
        : el("p", { class: "moderation-empty" }, "Все ваши контакты уже здесь"),
      notFound.length > 100 ? el("p", { class: "settings-toggle-hint" }, `…и ещё ${notFound.length - 100}. Показаны первые 100.`) : null,
      notFound.length ? el("button", { class: "profile-action-btn", onclick: copyInvite }, "Скопировать текст приглашения") : null,
      noticeEl,
    ]);
  }

  render();
}
