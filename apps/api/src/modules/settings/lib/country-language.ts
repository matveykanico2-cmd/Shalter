/** Код страны (ISO 3166-1 alpha-2) → язык интерфейса. Не в списке — русский. */
export const COUNTRY_LANGUAGE: Record<string, string> = {
  UA: "uk", // Украина
  BY: "be", // Беларусь
  KZ: "kk", // Казахстан
  UZ: "uz", // Узбекистан
  AZ: "az", // Азербайджан
  TR: "tr", // Турция
  EN: "en", // Англия / по умолчанию английский
};

/** Язык интерфейса по стране (ISO 3166-1 alpha-2). Неизвестная страна — русский. */
export function languageForCountry(countryCode: string | undefined): string {
  return COUNTRY_LANGUAGE[String(countryCode ?? "").toUpperCase()] ?? "ru";
}
