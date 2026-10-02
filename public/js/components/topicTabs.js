import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { openDropdownMenu } from "./dropdownMenu.js";

// Вкладки тем над перепиской группы (Topic Tabs в Telegram). active:
// undefined — «Все», "general" — «Общее», иначе id темы.
const TOPIC_ICONS = ["💬", "📌", "📢", "❓", "💡", "🎮", "🎵", "📷", "🛠", "📚", "💼", "🎉", "⚽", "🍕", "❤️", "🔥"];

export function TopicTabs({ chatId, topics, active, canCreate, isAdmin, meId, onSelect, onChanged }) {
  const bar = el("div", { class: "topic-tabs", role: "tablist" });

  function tab(id, label, { icon, color, closed, topic } = {}) {
    const selected = active === id;
    return el(
      "button",
      {
        class: `topic-tab${selected ? " active" : ""}${closed ? " closed" : ""}`,
        role: "tab",
        "aria-selected": selected ? "true" : "false",
        style: color ? `--topic-color:${color}` : "",
        onclick: () => onSelect(id),
        oncontextmenu: topic
          ? (e) => {
              e.preventDefault();
              openTopicMenu(e, topic);
            }
          : null,
      },
      [
        icon ? el("span", { class: "topic-tab-icon" }, icon) : color ? el("span", { class: "topic-tab-dot" }) : null,
        el("span", { class: "topic-tab-label" }, label),
        closed ? el("span", { class: "topic-tab-lock", html: iconSvg("Lock", 11) }) : null,
      ].filter(Boolean)
    );
  }

  function openTopicMenu(e, topic) {
    const mine = topic.createdBy === meId;
    const items = [];
    if (isAdmin || mine) items.push({ icon: "Edit", label: "Изменить", onClick: () => openTopicDialog(chatId, topic, onChanged) });
    if (isAdmin) {
      items.push({
        icon: topic.closed ? "Check" : "Lock",
        label: topic.closed ? "Открыть тему" : "Закрыть тему",
        onClick: () => api.updateTopic(chatId, topic.id, { closed: !topic.closed }).then(onChanged, (err) => alert(err.message)),
      });
      items.push({
        icon: "Trash",
        label: "Удалить тему",
        danger: true,
        onClick: () => {
          if (!confirm(`Удалить тему «${topic.title}» вместе со всеми сообщениями?`)) return;
          api.deleteTopic(chatId, topic.id).then(() => {
            if (active === topic.id) onSelect(undefined);
            onChanged();
          }, (err) => alert(err.message));
        },
      });
    }
    if (items.length) openDropdownMenu({ x: e.clientX, y: e.clientY }, items);
  }

  bar.append(
    tab(undefined, "Все"),
    tab("general", "Общее", { icon: "#" }),
    ...[...topics]
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
      .map((t) => tab(t.id, t.title, { icon: t.icon, color: t.color, closed: t.closed, topic: t }))
  );
  if (canCreate) {
    bar.appendChild(
      el("button", {
        class: "topic-tab topic-tab-add",
        title: "Новая тема",
        html: iconSvg("Plus", 14),
        onclick: () => openTopicDialog(chatId, null, (created) => {
          onChanged();
          if (created?.id) onSelect(created.id);
        }),
      })
    );
  }
  // Активная вкладка — в зоне видимости.
  requestAnimationFrame(() => bar.querySelector(".topic-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  return bar;
}

export function openTopicDialog(chatId, topic, onDone) {
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  let icon = topic?.icon ?? "";
  const input = el("input", { class: "settings-input", placeholder: "Название темы", maxlength: 64, value: topic?.title ?? "" });
  const icons = el("div", { class: "topic-icon-picker" });
  const errorSlot = el("p", { class: "login-error" });

  function renderIcons() {
    clear(icons);
    icons.append(
      el("button", { class: `topic-icon-choice${!icon ? " active" : ""}`, type: "button", title: "Без значка", onclick: () => ((icon = ""), renderIcons()) }, "∅"),
      ...TOPIC_ICONS.map((i) =>
        el("button", { class: `topic-icon-choice${icon === i ? " active" : ""}`, type: "button", onclick: () => ((icon = i), renderIcons()) }, i)
      )
    );
  }
  renderIcons();

  async function save() {
    const title = input.value.trim();
    if (!title) {
      errorSlot.textContent = "Введите название";
      return;
    }
    try {
      const res = topic
        ? await api.updateTopic(chatId, topic.id, { title, icon })
        : await api.createTopic(chatId, { title, icon });
      close();
      onDone?.(res.topic);
    } catch (err) {
      errorSlot.textContent = err.message || "Не удалось сохранить тему";
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });

  const dialog = el("div", { class: "modal-dialog" }, [
    el("h2", { class: "modal-title" }, topic ? "Изменить тему" : "Новая тема"),
    input,
    icons,
    errorSlot,
    el("button", { class: "btn-accent poll-create-btn", onclick: save }, topic ? "Сохранить" : "Создать"),
    el("button", { class: "modal-cancel", onclick: close }, "Отмена"),
  ]);
  overlay.appendChild(dialog);
  function close() {
    overlay.remove();
  }
  document.body.appendChild(overlay);
  input.focus();
}
