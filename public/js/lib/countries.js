// Country dialling codes for the phone field (components/phoneField.js).
//
// Deliberately a convenience list, not a gate: the field always accepts a typed
// "+<digits>" prefix even for a country that isn't here, and simply shows no
// flag for it. A hard-coded list that silently refuses somebody's real number
// would be worse than an incomplete one.
//
// `len` is the usual national-number length, used only to stop formatting from
// running away — never to reject input, because these vary within a country
// (Russia's own numbers are 10, but service numbers aren't) and change over time.
export const COUNTRIES = [
  { iso: "RU", dial: "7", flag: "🇷🇺", name: "Россия", len: 10 },
  { iso: "KZ", dial: "7", flag: "🇰🇿", name: "Казахстан", len: 10 },
  { iso: "BY", dial: "375", flag: "🇧🇾", name: "Беларусь", len: 9 },
  { iso: "UA", dial: "380", flag: "🇺🇦", name: "Украина", len: 9 },
  { iso: "UZ", dial: "998", flag: "🇺🇿", name: "Узбекистан", len: 9 },
  { iso: "KG", dial: "996", flag: "🇰🇬", name: "Кыргызстан", len: 9 },
  { iso: "TJ", dial: "992", flag: "🇹🇯", name: "Таджикистан", len: 9 },
  { iso: "TM", dial: "993", flag: "🇹🇲", name: "Туркменистан", len: 8 },
  { iso: "AZ", dial: "994", flag: "🇦🇿", name: "Азербайджан", len: 9 },
  { iso: "AM", dial: "374", flag: "🇦🇲", name: "Армения", len: 8 },
  { iso: "GE", dial: "995", flag: "🇬🇪", name: "Грузия", len: 9 },
  { iso: "MD", dial: "373", flag: "🇲🇩", name: "Молдова", len: 8 },
  { iso: "EE", dial: "372", flag: "🇪🇪", name: "Эстония", len: 8 },
  { iso: "LV", dial: "371", flag: "🇱🇻", name: "Латвия", len: 8 },
  { iso: "LT", dial: "370", flag: "🇱🇹", name: "Литва", len: 8 },
  { iso: "US", dial: "1", flag: "🇺🇸", name: "США", len: 10 },
  { iso: "CA", dial: "1", flag: "🇨🇦", name: "Канада", len: 10 },
  { iso: "GB", dial: "44", flag: "🇬🇧", name: "Великобритания", len: 10 },
  { iso: "DE", dial: "49", flag: "🇩🇪", name: "Германия", len: 11 },
  { iso: "FR", dial: "33", flag: "🇫🇷", name: "Франция", len: 9 },
  { iso: "IT", dial: "39", flag: "🇮🇹", name: "Италия", len: 10 },
  { iso: "ES", dial: "34", flag: "🇪🇸", name: "Испания", len: 9 },
  { iso: "PT", dial: "351", flag: "🇵🇹", name: "Португалия", len: 9 },
  { iso: "NL", dial: "31", flag: "🇳🇱", name: "Нидерланды", len: 9 },
  { iso: "BE", dial: "32", flag: "🇧🇪", name: "Бельгия", len: 9 },
  { iso: "CH", dial: "41", flag: "🇨🇭", name: "Швейцария", len: 9 },
  { iso: "AT", dial: "43", flag: "🇦🇹", name: "Австрия", len: 10 },
  { iso: "PL", dial: "48", flag: "🇵🇱", name: "Польша", len: 9 },
  { iso: "CZ", dial: "420", flag: "🇨🇿", name: "Чехия", len: 9 },
  { iso: "SK", dial: "421", flag: "🇸🇰", name: "Словакия", len: 9 },
  { iso: "HU", dial: "36", flag: "🇭🇺", name: "Венгрия", len: 9 },
  { iso: "RO", dial: "40", flag: "🇷🇴", name: "Румыния", len: 9 },
  { iso: "BG", dial: "359", flag: "🇧🇬", name: "Болгария", len: 9 },
  { iso: "GR", dial: "30", flag: "🇬🇷", name: "Греция", len: 10 },
  { iso: "RS", dial: "381", flag: "🇷🇸", name: "Сербия", len: 9 },
  { iso: "HR", dial: "385", flag: "🇭🇷", name: "Хорватия", len: 9 },
  { iso: "SI", dial: "386", flag: "🇸🇮", name: "Словения", len: 8 },
  { iso: "BA", dial: "387", flag: "🇧🇦", name: "Босния и Герцеговина", len: 8 },
  { iso: "ME", dial: "382", flag: "🇲🇪", name: "Черногория", len: 8 },
  { iso: "MK", dial: "389", flag: "🇲🇰", name: "Северная Македония", len: 8 },
  { iso: "AL", dial: "355", flag: "🇦🇱", name: "Албания", len: 9 },
  { iso: "SE", dial: "46", flag: "🇸🇪", name: "Швеция", len: 9 },
  { iso: "NO", dial: "47", flag: "🇳🇴", name: "Норвегия", len: 8 },
  { iso: "DK", dial: "45", flag: "🇩🇰", name: "Дания", len: 8 },
  { iso: "FI", dial: "358", flag: "🇫🇮", name: "Финляндия", len: 9 },
  { iso: "IS", dial: "354", flag: "🇮🇸", name: "Исландия", len: 7 },
  { iso: "IE", dial: "353", flag: "🇮🇪", name: "Ирландия", len: 9 },
  { iso: "TR", dial: "90", flag: "🇹🇷", name: "Турция", len: 10 },
  { iso: "IL", dial: "972", flag: "🇮🇱", name: "Израиль", len: 9 },
  { iso: "AE", dial: "971", flag: "🇦🇪", name: "ОАЭ", len: 9 },
  { iso: "SA", dial: "966", flag: "🇸🇦", name: "Саудовская Аравия", len: 9 },
  { iso: "QA", dial: "974", flag: "🇶🇦", name: "Катар", len: 8 },
  { iso: "EG", dial: "20", flag: "🇪🇬", name: "Египет", len: 10 },
  { iso: "MA", dial: "212", flag: "🇲🇦", name: "Марокко", len: 9 },
  { iso: "ZA", dial: "27", flag: "🇿🇦", name: "ЮАР", len: 9 },
  { iso: "NG", dial: "234", flag: "🇳🇬", name: "Нигерия", len: 10 },
  { iso: "KE", dial: "254", flag: "🇰🇪", name: "Кения", len: 9 },
  { iso: "CN", dial: "86", flag: "🇨🇳", name: "Китай", len: 11 },
  { iso: "JP", dial: "81", flag: "🇯🇵", name: "Япония", len: 10 },
  { iso: "KR", dial: "82", flag: "🇰🇷", name: "Южная Корея", len: 10 },
  { iso: "IN", dial: "91", flag: "🇮🇳", name: "Индия", len: 10 },
  { iso: "PK", dial: "92", flag: "🇵🇰", name: "Пакистан", len: 10 },
  { iso: "BD", dial: "880", flag: "🇧🇩", name: "Бангладеш", len: 10 },
  { iso: "ID", dial: "62", flag: "🇮🇩", name: "Индонезия", len: 10 },
  { iso: "TH", dial: "66", flag: "🇹🇭", name: "Таиланд", len: 9 },
  { iso: "VN", dial: "84", flag: "🇻🇳", name: "Вьетнам", len: 9 },
  { iso: "MY", dial: "60", flag: "🇲🇾", name: "Малайзия", len: 9 },
  { iso: "SG", dial: "65", flag: "🇸🇬", name: "Сингапур", len: 8 },
  { iso: "PH", dial: "63", flag: "🇵🇭", name: "Филиппины", len: 10 },
  { iso: "AU", dial: "61", flag: "🇦🇺", name: "Австралия", len: 9 },
  { iso: "NZ", dial: "64", flag: "🇳🇿", name: "Новая Зеландия", len: 9 },
  { iso: "BR", dial: "55", flag: "🇧🇷", name: "Бразилия", len: 11 },
  { iso: "AR", dial: "54", flag: "🇦🇷", name: "Аргентина", len: 10 },
  { iso: "MX", dial: "52", flag: "🇲🇽", name: "Мексика", len: 10 },
  { iso: "CL", dial: "56", flag: "🇨🇱", name: "Чили", len: 9 },
  { iso: "CO", dial: "57", flag: "🇨🇴", name: "Колумбия", len: 10 },
  { iso: "PE", dial: "51", flag: "🇵🇪", name: "Перу", len: 9 },
  { iso: "CU", dial: "53", flag: "🇨🇺", name: "Куба", len: 8 },
  { iso: "MN", dial: "976", flag: "🇲🇳", name: "Монголия", len: 8 },
  { iso: "AF", dial: "93", flag: "🇦🇫", name: "Афганистан", len: 9 },
  { iso: "IR", dial: "98", flag: "🇮🇷", name: "Иран", len: 10 },
  { iso: "IQ", dial: "964", flag: "🇮🇶", name: "Ирак", len: 10 },
  { iso: "SY", dial: "963", flag: "🇸🇾", name: "Сирия", len: 9 },
  { iso: "RS_XK", dial: "383", flag: "🇽🇰", name: "Косово", len: 8 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

// Longest dial code first, so "+7 999…" isn't mistaken for a shorter code and
// "+375…" beats "+37". Ties (the +7 and +1 pairs) resolve to the first entry —
// Russia and the USA — which is why those lead their groups above.
const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

// Which country a typed number belongs to, from its leading digits. Returns
// undefined for a prefix nobody uses, which is a real answer: the field keeps
// what was typed and just shows no flag.
export function countryForDigits(digits) {
  const d = String(digits ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  return BY_LENGTH.find((c) => d.startsWith(c.dial));
}

// "Рос", "russia", "ru", "+7", "7" all find Russia. Matching the dial code with
// or without the plus matters: people type the code far more often than the name.
export function searchCountries(query) {
  const q = String(query ?? "").trim().toLowerCase().replace(/^\+/, "");
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.iso.toLowerCase().startsWith(q) ||
      c.dial.startsWith(q)
  );
}

// The country to start on: whatever the browser's region says, falling back to
// Russia. navigator.language is "ru-RU" / "en-US" — the half after the dash is
// the region, and it's the only region hint available without asking for
// location permission.
export function guessCountry() {
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const tag of langs) {
    const region = String(tag).split("-")[1];
    if (!region) continue;
    const found = COUNTRIES.find((c) => c.iso === region.toUpperCase());
    if (found) return found;
  }
  return DEFAULT_COUNTRY;
}

// Groups the national part in 3-3-2-2 — close enough to how most of these
// countries write their numbers, and purely cosmetic: the server strips
// everything but digits before storing or comparing (see normalizePhone).
export function formatNational(digits, country) {
  const d = String(digits ?? "").replace(/\D/g, "").slice(0, Math.max(country?.len ?? 12, 12) + 3);
  const groups = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10), d.slice(10)].filter(Boolean);
  return groups.join(" ");
}
