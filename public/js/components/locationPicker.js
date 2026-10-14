import { el, clear } from "../lib/dom.js";
import { api } from "../api.js";

// Открывается, когда телефон не отдал координаты: можно отправить примерное
// место (по IP), найти адрес вручную или попробовать GPS ещё раз.
// Возвращает { lat, lng }, "retry" (ещё раз GPS) или null, если пользователь передумал.
export function openLocationPicker({ reason = "", retry } = {}) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "modal-overlay", onclick: (e) => e.target === overlay && done(null) });
    const approxBtn = el("button", { class: "choice-dialog-btn", disabled: true }, "Определяем примерное место…");
    const input = el("input", { class: "loc-picker-input", type: "search", placeholder: "Город, улица, место…", enterkeyhint: "search" });
    const results = el("div", { class: "loc-picker-results" });
    let approx = null;
    let searchTimer = 0;
    let searchSeq = 0;

    function done(value) {
      clearTimeout(searchTimer);
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(null);
      }
    }

    api
      .geoByIp()
      .then((r) => {
        approx = r;
        approxBtn.disabled = false;
        approxBtn.textContent = `📍 Отправить примерное${r.city ? ` — ${r.city}` : ""}`;
      })
      .catch(() => {
        approxBtn.textContent = "Примерное место определить не удалось";
      });
    approxBtn.onclick = () => approx && done({ lat: approx.lat, lng: approx.lng });

    async function search() {
      const q = input.value.trim();
      const seq = ++searchSeq;
      if (q.length < 3) return clear(results);
      results.replaceChildren(el("p", { class: "loc-picker-hint" }, "Ищем…"));
      try {
        const { places } = await api.geoSearch(q);
        if (seq !== searchSeq) return;
        results.replaceChildren(
          ...(places.length
            ? places.map((p) => el("button", { class: "loc-picker-item", onclick: () => done({ lat: p.lat, lng: p.lng }) }, p.name))
            : [el("p", { class: "loc-picker-hint" }, "Ничего не нашлось")])
        );
      } catch (err) {
        if (seq === searchSeq) results.replaceChildren(el("p", { class: "loc-picker-hint" }, err.message || "Поиск недоступен"));
      }
    }
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 450);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(searchTimer);
        search();
      }
    });

    const dialog = el("div", { class: "modal-dialog choice-dialog loc-picker" }, [
      el("h2", { class: "modal-title" }, "Геолокация"),
      reason ? el("p", { class: "loc-picker-reason" }, reason) : null,
      approxBtn,
      input,
      results,
      retry
        ? el("button", { class: "choice-dialog-btn", onclick: () => done("retry") }, "Попробовать GPS ещё раз")
        : null,
      el("button", { class: "modal-cancel", onclick: () => done(null) }, "Отмена"),
    ].filter(Boolean));
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey, true);
  });
}
