import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openSideTab, twInputField, twAvatarEdit } from "./twTab.js";
import { showToast } from "./toast.js";

// Вкладка tweb «Новая группа» / «Новый канал» (AppNewGroupTab / AppNewChannelTab):
// круглый аватар с камерой, название и описание с подписью на рамке, тип и ссылка, участники.
// Сообщества создаются отдельно — components/communityEditor.js.
export function openCreateChatDialog(kind, onSubmit, { members = [], fabIcon } = {}) {
  const isChannel = kind === "channel";
  const what = isChannel ? "канала" : "группы";
  let isPublic = false;

  const avatar = twAvatarEdit();
  const name = twInputField({ label: `Название ${what}`, maxLength: 128 });
  const desc = twInputField({ label: "Описание (необязательно)", multiline: true, maxLength: 255 });
  const handle = twInputField({
    label: "Юзернейм",
    inputClass: "mono",
    oninput: (e) => {
      e.target.value = e.target.value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
    },
  });

  const typeRows = el("div");
  const handleSection = el("div", { class: "tw-section-group" }, [
    el("div", { class: "tw-section tw-section-pad" }, [handle.field]),
    el("p", { class: "tw-section-caption" }, "Можно использовать латиницу, цифры и подчёркивание. Минимум 3 символа."),
  ]);
  const typeCaption = el("p", { class: "tw-section-caption" });

  function renderType() {
    typeRows.replaceChildren(
      ...[
        { pub: false, title: isChannel ? "Частный канал" : "Частная группа", sub: "Вступить можно по пригласительной ссылке" },
        { pub: true, title: isChannel ? "Публичный канал" : "Публичная группа", sub: "Найдут в поиске и откроют по ссылке" },
      ].map((o) =>
        el("button", { type: "button", class: `tw-row clickable tw-radio-row${isPublic === o.pub ? " selected" : ""}`, onclick: () => { isPublic = o.pub; renderType(); if (o.pub) handle.input.focus(); } }, [
          el("span", { class: "tw-radio" }),
          el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, o.title), el("span", { class: "tw-row-subtitle" }, o.sub)]),
        ])
      )
    );
    handleSection.hidden = !isPublic;
    typeCaption.textContent = isPublic
      ? `Любой сможет найти ${isChannel ? "канал" : "группу"} и открыть по ссылке.`
      : "Пригласительная ссылка появится сразу после создания.";
  }
  renderType();

  const content = [
    el("div", { class: "tw-create-head" }, [avatar.element]),
    el("div", { class: "tw-section-group" }, [
      el("div", { class: "tw-section tw-section-pad" }, [name.field, desc.field]),
      el("p", { class: "tw-section-caption" }, isChannel
        ? "Можно добавить описание — его увидят в профиле канала."
        : "Название и фото увидят все участники."),
    ]),
    el("div", { class: "tw-section-group" }, [
      el("p", { class: "tw-section-name" }, isChannel ? "Тип канала" : "Тип группы"),
      el("div", { class: "tw-section" }, [typeRows]),
      typeCaption,
    ]),
    handleSection,
    members.length
      ? el("div", { class: "tw-section-group" }, [
          el("p", { class: "tw-section-name" }, `${members.length} ${plural(members.length, "участник", "участника", "участников")}`),
          el(
            "div",
            { class: "tw-section" },
            members.map((u) =>
              el("div", { class: "tw-row tw-user-row" }, [
                Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 42 }),
                el("span", { class: "tw-row-body" }, [el("span", { class: "tw-row-title" }, u.name), u.username ? el("span", { class: "tw-row-subtitle" }, `@${u.username}`) : null]),
              ])
            )
          ),
        ])
      : null,
  ];

  openSideTab({
    title: isChannel ? "Новый канал" : "Новая группа",
    content,
    fab: {
      icon: fabIcon ?? (isChannel ? "ChevronRight" : "Check"),
      title: "Далее",
      onClick: async (tab) => {
        const title = name.input.value.trim();
        if (!title) {
          name.field.classList.add("error");
          name.input.focus();
          return;
        }
        name.field.classList.remove("error");
        const username = handle.input.value.trim();
        if (isPublic && username.length < 3) {
          handle.field.classList.add("error");
          handle.input.focus();
          showToast("Для публичного нужна ссылка — от 3 символов");
          return;
        }
        tab.setFabBusy(true);
        try {
          const extra = { description: desc.input.value.trim(), username: isPublic ? username : null, isPublic };
          await onSubmit(title, avatar.image, extra, tab);
        } catch (err) {
          showToast(err?.message || "Не получилось");
        } finally {
          tab.setFabBusy(false);
        }
      },
    },
  });
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
