import { el, clear } from "../lib/dom.js";
import { COUNTRIES, countryForDigits, searchCountries, guessCountry, formatNational } from "../lib/countries.js";

export function PhoneField({ value = "", onChange, autofocus = false, placeholder } = {}) {
  let country = guessCountry();
  let national = "";
  let open = false;

  if (value) {
    const digits = String(value).replace(/\D/g, "");
    const found = countryForDigits(digits);
    if (found) {
      country = found;
      national = digits.slice(found.dial.length);
    } else {
      national = digits;
    }
  }

  const flagEl = el("span", { class: "phone-country-flag" });
  const dialEl = el("span", { class: "phone-country-dial mono" });
  const countryBtn = el(
    "button",
    {
      type: "button",
      class: "phone-country-btn",
      title: "Код страны",
      onclick: () => {
        open = !open;
        renderMenu();
        if (open) searchInput.focus();
      },
    },
    [flagEl, dialEl, el("span", { class: "phone-country-caret" }, "▾")]
  );

  const numberInput = el("input", {
    class: "login-input phone-number-input",
    type: "tel",
    autocomplete: "tel",
    placeholder: placeholder ?? "999 123 45 67",
    oninput: (e) => {
      const raw = e.target.value;
      if (raw.trim().startsWith("+")) {
        const digits = raw.replace(/\D/g, "");
        const found = countryForDigits(digits);
        if (found) {
          country = found;
          national = digits.slice(found.dial.length);
          paint();
          emit();
          return;
        }
      }
      national = raw.replace(/\D/g, "");
      e.target.value = formatNational(national, country);
      emit();
    },
  });

  const searchInput = el("input", {
    class: "login-input phone-country-search",
    placeholder: "Страна или код",
    oninput: () => renderList(),
    onkeydown: (e) => {
      if (e.key === "Escape") {
        open = false;
        renderMenu();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const first = searchCountries(searchInput.value)[0];
        if (first) pick(first);
      }
    },
  });
  const listEl = el("div", { class: "phone-country-list" });
  const menu = el("div", { class: "phone-country-menu" }, [searchInput, listEl]);

  const wrap = el("div", { class: "phone-field" }, [countryBtn, numberInput]);

  function pick(c) {
    country = c;
    open = false;
    paint();
    renderMenu();
    emit();
    numberInput.focus();
  }

  function renderList() {
    clear(listEl);
    const found = searchCountries(searchInput.value);
    if (!found.length) {
      listEl.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
      return;
    }
    listEl.append(
      ...found.map((c) =>
        el("button", { type: "button", class: `phone-country-row ${c.iso === country.iso ? "active" : ""}`, onclick: () => pick(c) }, [
          el("span", { class: "phone-country-flag" }, c.flag),
          el("span", { class: "phone-country-name" }, c.name),
          el("span", { class: "phone-country-dial mono" }, `+${c.dial}`),
        ])
      )
    );
  }

  function renderMenu() {
    if (open) {
      searchInput.value = "";
      renderList();
      wrap.appendChild(menu);
      setTimeout(() => document.addEventListener("mousedown", onOutside), 0);
    } else {
      menu.remove();
      document.removeEventListener("mousedown", onOutside);
    }
  }

  function onOutside(e) {
    if (!wrap.contains(e.target)) {
      open = false;
      renderMenu();
    }
  }

  function paint() {
    flagEl.textContent = country.flag;
    dialEl.textContent = `+${country.dial}`;
    numberInput.value = formatNational(national, country);
  }

  function emit() {
    onChange?.(value_());
  }

  function value_() {
    return national ? `+${country.dial}${national}` : "";
  }

  paint();
  if (autofocus) queueMicrotask(() => numberInput.focus());

  return {
    el: wrap,
    value: value_,
    focus: () => numberInput.focus(),
    looksComplete: () => national.length >= Math.min(country.len ?? 9, 9),
    country: () => country,
  };
}

export { COUNTRIES };
