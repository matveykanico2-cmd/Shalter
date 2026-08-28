import { el } from "../lib/dom.js";

// Ввод даты руками: ДД.ММ.ГГГГ, обычное текстовое поле с маской.
//
// Почему не <input type="date">: родной календарь открывается на текущем
// месяце, а дату рождения нужно листать на тридцать-сорок лет назад — год за
// годом, стрелкой. Написать «25.12.1990» — четыре секунды; долистать — минута
// злости. Календарь хорош для «на следующей неделе», а не для «когда я родился».
//
// Точки ставятся сами: человек набирает восемь цифр подряд, и разделители не
// приходится ни печатать, ни обходить стрелками.

const MIN_YEAR = 1900;

const onlyDigits = (s) => s.replace(/\D/g, "").slice(0, 8);
const countDigits = (s) => (s.match(/\d/g) ?? []).length;

function format(digits) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

// Куда поставить курсор, чтобы перед ним осталось столько же цифр, сколько было
// до перерисовки: иначе после каждой автоматической точки курсор прыгал бы в
// конец, и правку в середине даты пришлось бы начинать заново.
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

// Хранится и уходит на сервер ISO (ГГГГ-ММ-ДД) — то же, что отдавал календарь,
// так что ни база, ни чужие экраны про эту замену не знают.
export function isoToText(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

// Разбор — он же проверка. Возвращает { iso, error }: пустая строка это не
// ошибка, а «дата не указана», и она стирает прежнюю.
export function parseDateText(text) {
  const digits = onlyDigits(text);
  if (!digits) return { iso: "", error: null };
  if (digits.length < 8) return { iso: null, error: "Впишите дату полностью: ДД.ММ.ГГГГ" };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  if (month < 1 || month > 12) return { iso: null, error: "Месяца с таким номером нет" };
  if (year < MIN_YEAR) return { iso: null, error: `Год не раньше ${MIN_YEAR}` };

  // Проверка календарём, а не «день до 31»: 31 февраля Date молча превратит в
  // 3 марта, и человек сохранил бы не ту дату, ничего не заметив.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return { iso: null, error: "Такого дня в этом месяце нет" };
  }
  if (date.getTime() > Date.now()) return { iso: null, error: "Дата рождения не может быть в будущем" };

  return { iso: `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`, error: null };
}

// onChange(iso, error) — iso равен null, пока написанное не складывается в дату.
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

    // Стёрли точку — стираем и цифру перед ней. Без этого точка тут же
    // возвращалась бы на место, и удалить дату задом наперёд было бы нельзя.
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
    // Состояние поля по требованию — экрану оно нужно в момент сохранения, а не
    // на каждую букву.
    read: () => parseDateText(input.value),
    set(iso) {
      input.value = isoToText(iso);
      prev = input.value;
    },
  };
}
