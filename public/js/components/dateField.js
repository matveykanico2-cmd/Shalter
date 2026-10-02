import { el } from "../lib/dom.js";

const MIN_YEAR = 1900;

const onlyDigits = (s) => s.replace(/\D/g, "").slice(0, 8);
const countDigits = (s) => (s.match(/\d/g) ?? []).length;

function format(digits) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function caretAfterDigits(text, n) {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return text.length;
}

export function isoToText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

export function parseDateText(text) {
  const digits = onlyDigits(text);
  if (!digits) return { iso: "", error: null };
  if (digits.length < 8) return { iso: null, error: "Впишите дату полностью: ДД.ММ.ГГГГ" };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (month < 1 || month > 12) return { iso: null, error: "Месяца с таким номером нет" };
  if (year < MIN_YEAR) return { iso: null, error: `Год не раньше ${MIN_YEAR}` };

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return { iso: null, error: "Такого дня в этом месяце нет" };
  }
  if (date.getTime() > Date.now()) return { iso: null, error: "Дата рождения не может быть в будущем" };

  return { iso: `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`, error: null };
}

export function DateField({ value = "", onChange, className = "settings-input" } = {}) {
  const input = el("input", {
    class: className,
    type: "text",
    inputmode: "numeric",
    autocomplete: "bday",
    placeholder: "ДД.ММ.ГГГГ",
    maxlength: 10,
    value: isoToText(value),
  });

  let prev = input.value;

  input.addEventListener("input", (e) => {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    let digitsBefore = countDigits(raw.slice(0, caret));
    let digits = onlyDigits(raw);

    if (e.inputType === "deleteContentBackward" && prev.length - raw.length === 1 && prev[caret] === ".") {
      digits = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore);
      digitsBefore -= 1;
    }

    const text = format(digits);
    input.value = text;
    prev = text;
    const pos = caretAfterDigits(text, digitsBefore);
    input.setSelectionRange?.(pos, pos);

    const { iso, error } = parseDateText(text);
    onChange?.(iso, error);
  });

  return {
    el: input,
    read: () => parseDateText(input.value),
    set(iso) {
      input.value = isoToText(iso);
      prev = input.value;
    },
  };
}
