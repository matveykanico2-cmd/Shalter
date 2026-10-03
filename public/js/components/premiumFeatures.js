import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";

// Карусель возможностей Premium как в tweb (featuresCarousel + promoSlideTab):
// сверху крупная иконка на градиенте (вместо видео Telegram), название, описание,
// точки снизу, листание стрелками/свайпом, кнопка «Подписаться».
export function openPremiumFeatures({ features, start = 0, isPremium = false, onSubscribe }) {
  let index = start;
  const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && close() });
  const track = el(
    "div",
    { class: "tw-pf-track" },
    features.map((f) =>
      el("div", { class: "tw-pf-slide" }, [
        el("div", { class: "tw-pf-hero", style: `--pf-color: ${f.color}` }, [
          el("div", { class: "tw-pf-phone" }, [el("span", { class: "tw-pf-icon", html: iconSvg(f.icon, 64) })]),
        ]),
        el("h2", { class: "tw-pf-title" }, f.title),
        el("p", { class: "tw-pf-desc" }, f.desc),
      ])
    )
  );
  const dots = el("div", { class: "tw-pf-dots" }, features.map((_, i) => el("button", { class: "tw-pf-dot", title: features[i].title, onclick: () => go(i) })));
  const prev = el("button", { class: "tw-pf-nav prev", title: "Назад", html: iconSvg("ChevronLeft", 24), onclick: () => go(index - 1) });
  const next = el("button", { class: "tw-pf-nav next", title: "Дальше", html: iconSvg("ChevronRight", 24), onclick: () => go(index + 1) });

  function go(i) {
    index = Math.max(0, Math.min(features.length - 1, i));
    track.style.transform = `translateX(${-index * 100}%)`;
    [...dots.children].forEach((d, j) => d.classList.toggle("active", j === index));
    prev.hidden = index === 0;
    next.hidden = index === features.length - 1;
  }

  function onKey(e) {
    if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "Escape") close();
    else return;
    e.stopPropagation();
  }
  function close() {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  }

  let startX = null;
  const viewport = el(
    "div",
    {
      class: "tw-pf-viewport",
      onpointerdown: (e) => (startX = e.clientX),
      onpointerup: (e) => {
        if (startX == null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      },
    },
    [track]
  );

  overlay.appendChild(
    el("div", { class: "modal-dialog tw-popup tw-pf-popup" }, [
      el("button", { class: "tw-popup-close tw-pf-close", title: "Закрыть", html: iconSvg("X", 22), onclick: close }),
      viewport,
      prev,
      next,
      dots,
      el("div", { class: "tw-pf-footer" }, [
        isPremium
          ? el("button", { class: "tw-premium-confirm", onclick: close }, "Понятно")
          : el("button", { class: "tw-premium-confirm", onclick: () => { close(); onSubscribe?.(); } }, "Подписаться на Shalter Premium"),
      ]),
    ])
  );
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  track.style.transition = "none";
  go(index);
  requestAnimationFrame(() => (track.style.transition = ""));
}
