import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";

export async function ContactsView(root) {
  const [{ contacts: initialContacts }, { users: allUsers }] = await Promise.all([api.listContacts(), api.listUsers()]);
  let contacts = initialContacts;
  let candidates = allUsers.filter((u) => !contacts.some((c) => c.userId === u.id));
  let adding = false;
  let query = "";

  function render() {
    const sorted = [...contacts].sort((a, b) => a.user.name.localeCompare(b.user.name, "ru"));
    const filteredCandidates = candidates.filter(
      (u) => u.name.toLowerCase().includes(query.toLowerCase()) || u.username.toLowerCase().includes(query.toLowerCase())
    );

    const header = el("header", { class: "contacts-header" }, [
      el("p", { class: "view-title" }, "Контакты"),
      el(
        "button",
        { class: "btn-accent-pill", onclick: () => { adding = !adding; render(); } },
        [el("span", { html: iconSvg("Plus", 15) }), " Добавить"]
      ),
    ]);

    const addPanel = adding
      ? el("div", { class: "contacts-add-panel" }, [
          el("input", {
            class: "login-input",
            autofocus: true,
            placeholder: "Имя или @юзернейм",
            value: query,
            oninput: (e) => { query = e.target.value; render(); },
          }),
          el(
            "div",
            { class: "contacts-candidates" },
            filteredCandidates.length === 0
              ? el("p", { class: "empty-hint" }, "Никого не найдено")
              : filteredCandidates.map((u) =>
                  el(
                    "button",
                    {
                      class: "contact-candidate-row",
                      onclick: async () => {
                        await api.addContact(u.id);
                        contacts = [...contacts, { id: `ct_${u.id}`, userId: u.id, addedAt: new Date().toISOString(), user: u }];
                        candidates = candidates.filter((x) => x.id !== u.id);
                        render();
                      },
                    },
                    [Avatar({ name: u.name, color: u.avatarColor, image: u.avatarImage, size: 32 }), el("span", { class: "contact-candidate-name" }, u.name), el("span", { class: "contact-candidate-username" }, `@${u.username}`)]
                  )
                )
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
              Avatar({ name: user.name, color: user.avatarColor, image: user.avatarImage, online: user.online }),
              el("div", { class: "contact-row-body" }, [
                el("p", { class: "contact-row-name" }, user.name),
                el("p", { class: "contact-row-username" }, `@${user.username}`),
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
                class: "icon-btn",
                title: "Удалить из контактов",
                html: iconSvg("Trash", 16),
                onclick: async () => {
                  await api.removeContact(user.id);
                  contacts = contacts.filter((c) => c.userId !== user.id);
                  candidates = [...candidates, user];
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
