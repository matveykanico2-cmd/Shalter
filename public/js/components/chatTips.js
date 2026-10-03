import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";
import { applyAccentSetting, isThemeAccent } from "../lib/accent.js";

// Пустая колонка чата, как в tweb (components/chatTips): по центру карточки-подсказки
// с настоящими переключателями, под ними «Назад / Далее». Кнопка в углу сворачивает
// колоду в плашку «Выберите чат, чтобы начать общение».

const FOLDED_KEY = "shalter.chatTips.folded";
const INDEX_KEY = "shalter.chatTips.index";
const ACCENTS = ["", "#3390EC", "#E53935", "#4FAE4E", "#E39D2B", "#8774E1", "#00A99D", "#E0507A"];

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function patchSettings(p) {
  const settings = { ...(getState().settings ?? {}), ...p };
  setState({ settings });
  api.patchSettings(p).catch(() => {});
}

function TipCard({ title, buttons, contentTitle, content, description }) {
  return el("div", { class: "chat-tip-card" }, [
    el("p", { class: "chat-tip-title" }, title),
    el(
      "div",
      { class: "chat-tip-buttons" },
      buttons.map((b) =>
        el("button", { type: "button", class: `chat-tip-button${b.selected ? " selected" : ""}`, onclick: b.onClick }, [
          el("span", { class: "chat-tip-button-icon", html: iconSvg(b.icon, 16) }),
          el("span", { class: "chat-tip-button-text" }, b.text),
        ])
      )
    ),
    el("div", { class: "chat-tip-content" }, [contentTitle ? el("p", { class: "chat-tip-content-title" }, contentTitle) : null, content]),
    el("p", { class: "chat-tip-description" }, description),
  ]);
}

function AppearanceCard(rerender) {
  const s = getState().settings ?? {};
  const theme = s.theme ?? "system";
  const setTheme = (t) => {
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    patchSettings({ theme: t });
    rerender();
  };
  const setAccent = (hex) => {
    applyAccentSetting(hex);
    patchSettings({ accent: hex });
    rerender();
  };
  return TipCard({
    title: "Оформление",
    buttons: [
      { icon: "Monitor", text: "Авто", selected: theme === "system", onClick: () => setTheme("system") },
      { icon: "Moon", text: "Тёмная", selected: theme === "dark", onClick: () => setTheme("dark") },
      { icon: "Sun", text: "Светлая", selected: theme === "light", onClick: () => setTheme("light") },
    ],
    contentTitle: "Цвет акцента",
    content: el(
      "div",
      { class: "chat-tip-accents" },
      ACCENTS.map((hex) =>
        el("button", {
          type: "button",
          class: `chat-tip-accent${(hex ? s.accent === hex : isThemeAccent(s.accent)) ? " selected" : ""}`,
          title: hex || "Как в теме",
          style: { background: hex || "linear-gradient(135deg, #3390ec 50%, #8774e1 50%)" },
          onclick: () => setAccent(hex),
        })
      )
    ),
    description: el("span", {}, [
      "Это и многое другое меняется в ",
      el("a", { href: "/settings/appearance", onclick: (e) => (e.preventDefault(), navigate("/settings/appearance")) }, "Настройки › Внешний вид"),
      ".",
    ]),
  });
}

let chatsFilter = "recent";
function ChatsCard(rerender) {
  const { chats = [], user } = getState();
  const visible = chats.filter((c) => !c.archived && !c.isSaved);
  const byTime = (a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? "");
  const lists = {
    recent: [...visible].sort(byTime),
    unread: visible.filter((c) => c.unreadCount > 0 || c.unread || c.hasUnreadMention).sort(byTime),
    people: visible.filter((c) => c.type === "dm").sort(byTime),
  };
  const filters = [
    ["recent", "Clock", "Недавние"],
    ["people", "User", "Люди"],
    ["unread", "MessageCircle", "Новые"],
  ];
  const current = lists[chatsFilter]?.length ? chatsFilter : filters.find(([id]) => lists[id].length)?.[0] ?? "recent";
  const peers = lists[current].slice(0, 8);
  return TipCard({
    title: "Чаты",
    buttons: filters.map(([id, icon, text]) => ({ icon, text, selected: current === id, onClick: () => ((chatsFilter = id), rerender()) })),
    content: peers.length
      ? el(
          "div",
          { class: "chat-tip-peers" },
          peers.map((c) => {
            const name = c.type === "dm" ? (c.otherUser?.name ?? c.title) : c.title;
            return el("button", { type: "button", class: "chat-tip-peer", title: name, onclick: () => navigate(`/chat/${c.id}`) }, [
              Avatar({ name, color: c.otherUser?.avatarColor ?? c.avatarColor, image: c.otherUser?.avatarImage ?? c.avatarImage, size: 54, online: c.type === "dm" && c.otherUser?.online }),
              el("span", { class: "chat-tip-peer-name" }, (name || "").split(" ")[0]),
            ]);
          })
        )
      : el("p", { class: "chat-tip-empty" }, user ? "Здесь пока пусто." : ""),
    description: el("span", {}, [el("b", {}, "Ctrl+K"), " — быстрый переход к любому чату."]),
  });
}

const CARDS = [AppearanceCard, ChatsCard];

export function ChatTips() {
  let folded = readLS(FOLDED_KEY, "0") === "1";
  let index = Math.min(CARDS.length - 1, Math.max(0, Number(readLS(INDEX_KEY, "0")) || 0));
  const root = el("div", { class: "chat-tips" });

  function render() {
    root.replaceChildren(
      el("button", {
        type: "button",
        class: "chat-tips-toggle",
        title: folded ? "Показать советы" : "Скрыть советы",
        html: iconSvg(folded ? "Info" : "X", 20),
        onclick: () => {
          folded = !folded;
          writeLS(FOLDED_KEY, folded ? "1" : "0");
          render();
        },
      }),
      el("div", { class: `chat-tips-deck${folded ? " hidden" : ""}` }, [
        el(
          "div",
          { class: "chat-tips-stage" },
          CARDS.map((Card, i) => el("div", { class: `chat-tips-slot${i === index ? " active" : ""}`, style: `--tip-slide: ${(i - index) * 50}px`, inert: i !== index }, [Card(render)]))
        ),
        el("div", { class: "chat-tips-nav" }, [
          el("button", { type: "button", class: "chat-tips-nav-btn", onclick: () => step(-1) }, [el("span", { html: iconSvg("ChevronLeft", 16) }), "Предыдущий совет"]),
          el("button", { type: "button", class: "chat-tips-nav-btn", onclick: () => step(1) }, ["Следующий совет", el("span", { html: iconSvg("ChevronRight", 16) })]),
        ]),
      ]),
      el("div", { class: `chat-tips-select${folded ? " shown" : ""}` }, [el("span", { class: "chat-tips-select-pill" }, "Выберите чат, чтобы начать общение")])
    );
  }
  function step(d) {
    index = (index + d + CARDS.length) % CARDS.length;
    writeLS(INDEX_KEY, String(index));
    render();
  }
  render();
  return root;
}
