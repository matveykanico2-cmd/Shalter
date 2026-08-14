import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { setState } from "../state.js";

// Public-channel directory (chatList.js's "+" menu → "Публичные каналы") —
// mirrors ContactsView's shape (header + search + row list) but hits
// GET /api/channels instead, which needs no membership/contact relationship
// at all (see server/routes/channels.js) — that's the whole point of a
// channel being public.
export async function DiscoverChannelsView(root) {
  // ?q= lets the main search hand a channel over to this screen with the search
  // already run, instead of dumping the user on an empty discovery page and
  // making them retype what they just typed.
  let query = new URLSearchParams(window.location.search).get("q") ?? "";
  let channels = [];
  let loading = true;
  let searchTimer = null;

  async function search(q) {
    loading = true;
    render();
    try {
      const res = await api.discoverChannels(q);
      channels = res.channels;
    } catch {
      channels = [];
    }
    loading = false;
    render();
  }

  async function subscribe(channel) {
    try {
      await api.subscribeChannel(channel.id);
      await api.listChats().then((r) => setState({ chats: r.chats }));
      navigate(`/chat/${channel.id}`);
    } catch (err) {
      alert(err.message || "Не удалось подписаться");
    }
  }

  function row(c) {
    return el("div", { class: "contact-row" }, [
      c.isMember
        ? el(
            "button",
            { class: "contact-row-profile-btn", onclick: () => navigate(`/chat/${c.id}`) },
            [Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage }), rowBody(c)]
          )
        : el("div", { class: "contact-row-profile-btn" }, [Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage }), rowBody(c)]),
      c.isMember
        ? el("span", { class: "settings-toggle-hint" }, "Вы подписаны")
        : el("button", { class: "btn-accent-pill", onclick: () => subscribe(c) }, "Подписаться"),
    ]);
  }

  function rowBody(c) {
    return el("div", { class: "contact-row-body" }, [
      el("p", { class: "contact-row-name" }, c.title),
      el(
        "p",
        { class: "contact-row-status" },
        [c.username ? `@${c.username}` : null, `${c.subscriberCount} подписчик${pluralSuffix(c.subscriberCount)}`].filter(Boolean).join(" · ")
      ),
    ]);
  }

  function pluralSuffix(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "а";
    return "ов";
  }

  function render() {
    mount(
      root,
      el("div", { class: "contacts-view" }, [
        el("header", { class: "contacts-header" }, [
          el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
          el("p", { class: "view-title" }, "Публичные каналы"),
        ]),
        el("div", { class: "contacts-add-panel" }, [
          el("input", {
            class: "settings-input",
            placeholder: "Поиск по названию или @юзернейму",
            value: query,
            oninput: (e) => {
              query = e.target.value;
              clearTimeout(searchTimer);
              searchTimer = setTimeout(() => search(query), 300);
            },
          }),
        ]),
        el(
          "div",
          { class: "contacts-list" },
          loading
            ? el("p", { class: "empty-hint" }, "Загрузка…")
            : channels.length === 0
              ? el("p", { class: "empty-hint" }, query ? "Ничего не найдено" : "Публичных каналов пока нет")
              : channels.map(row)
        ),
      ])
    );
  }

  render();
  search(query);
}
