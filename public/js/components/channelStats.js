import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";

function fmt(n) {
  return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function dayLabel(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tile(value, label, hint) {
  return el("div", { class: "stats-tile", title: hint ?? "" }, [
    el("span", { class: "stats-tile-value" }, fmt(value)),
    el("span", { class: "stats-tile-label" }, label),
  ]);
}

export function openChannelStats(chat) {
  const overlay = el("div", { class: "profile-panel-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "info-panel-body stats-panel-body" }, [el("p", { class: "empty-hint" }, "Считаем…")]);
  const panel = el("aside", { class: "profile-panel stats-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, "Статистика"),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
    ]),
    body,
  ]);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  function chart(byDay) {
    const peak = Math.max(1, ...byDay.map((d) => d.views));
    return el(
      "div",
      { class: "stats-chart" },
      byDay.map((d) =>
        el("div", { class: "stats-chart-col", title: `${dayLabel(d.date)}: ${fmt(d.views)} ${plural(d.views, "просмотр", "просмотра", "просмотров")}, постов — ${d.posts}` }, [
          el("div", { class: "stats-chart-bar", style: `height: ${Math.round((d.views / peak) * 100)}%` }),
          el("span", { class: "stats-chart-day" }, dayLabel(d.date).slice(0, 2)),
        ])
      )
    );
  }

  function render(stats) {
    clear(body);
    body.append(
      el("div", { class: "stats-tiles" }, [
        tile(stats.subscribers, plural(stats.subscribers, "подписчик", "подписчика", "подписчиков")),
        tile(stats.posts, plural(stats.posts, "пост", "поста", "постов")),
        tile(stats.views, plural(stats.views, "просмотр", "просмотра", "просмотров")),
        tile(stats.averageViews, "в среднем на пост"),
        tile(stats.comments, plural(stats.comments, "комментарий", "комментария", "комментариев")),
        tile(stats.reactions, plural(stats.reactions, "реакция", "реакции", "реакций")),
      ]),
      el("p", { class: "list-section-label" }, "Просмотры по дням (2 недели)"),
      chart(stats.byDay),
      el("p", { class: "list-section-label" }, "Самые читаемые посты"),
      ...(stats.top.length
        ? stats.top.map((p) =>
            el("div", { class: "stats-top-row" }, [
              el("p", { class: "stats-top-text" }, p.text || "Без текста"),
              el("p", { class: "stats-top-meta" }, `${fmt(p.views)} ${plural(p.views, "просмотр", "просмотра", "просмотров")} · ${fmt(p.commentCount)} ${plural(p.commentCount, "комментарий", "комментария", "комментариев")} · ${dayLabel(p.createdAt)}`),
            ])
          )
        : [el("p", { class: "empty-hint" }, "Постов пока нет")])
    );
  }

  api
    .getChannelStats(chat.id)
    .then(render)
    .catch((err) => {
      clear(body);
      body.appendChild(el("p", { class: "login-error" }, err.message || "Статистика недоступна"));
    });
}
