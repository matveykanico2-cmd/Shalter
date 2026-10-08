import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { matchAndAddAll, canReadPhoneBook, readPhoneBook } from "../lib/contactSync.js";
import { isContactPickerSupported, pickPhoneContacts, readVCardFiles, parsePastedContacts, isIos } from "../lib/phoneContacts.js";

export function openImportContactsDialog(onAdded) {
  let step = "pick";
  let error = null;
  let found = [];
  let notFound = [];
  let checked = 0;
  let addedCount = 0;
  let addedIds = new Set();
  let invitedPhones = new Set();
  const inviteLink = `${window.location.origin}/login`;
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

  const fileInput = el("input", {
    type: "file",
    accept: ".vcf,text/vcard,text/x-vcard",
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
      // Как в Telegram: всех найденных — сразу в контакты, без «Добавить» у каждого.
      ({ found, notFound, checked, added: addedCount } = await matchAndAddAll(entries));
      if (addedCount) onAdded?.();
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
      const entries = canReadPhoneBook() ? await readPhoneBook() : await pickPhoneContacts();
      if (!entries.length) return;
      await match(entries);
    } catch (err) {
      error = err.message || "Не удалось получить доступ к контактам";
      render();
    }
  }

  async function addContact(entry) {
    if (busyId) return;
    busyId = entry.user.id;
    render();
    try {
      await api.addContact(entry.user.id, entry.localName || null);
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
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteText() });
        return;
      } catch {
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
    const added = addedIds.has(u.id) || entry.alreadyContact || entry.justAdded;
    return el("div", { class: "import-contact-row" }, [
      Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 36, online: u.online }),
      el("div", { class: "import-contact-body" }, [
        el("p", { class: "import-contact-name" }, u.name),
        el(
          "p",
          { class: "import-contact-sub" },
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
        canReadPhoneBook()
          ? el("button", { class: "btn-accent", onclick: usePicker }, "Найти друзей из контактов телефона")
          : isContactPickerSupported()
            ? el("button", { class: "btn-accent", onclick: usePicker }, "Выбрать из контактов телефона")
            : null,
        el("button", { class: "profile-action-btn import-vcf-btn", onclick: () => fileInput.click() }, [
          el("span", { html: iconSvg("Download", 15) }),
          " Выбрать файлы контактов (.vcf)",
        ]),
        fileInput,
        el(
          "p",
          { class: "settings-toggle-hint" },
          canReadPhoneBook() || isContactPickerSupported()
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

    noticeEl = el("p", { class: "settings-toggle-hint" }, "");
    show([
      el("p", { class: "settings-toggle-hint" }, `Проверено номеров: ${checked}${addedCount ? ` · добавлено в контакты: ${addedCount}` : ""}`),
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
