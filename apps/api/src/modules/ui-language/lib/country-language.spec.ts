import { describe, expect, it } from "vitest";
import { languageForCountry, languageFromAcceptHeader, normalizeLanguage } from "./country-language.js";

const isUnsupported = (code: string) => code.toLowerCase().split(/[-_]/)[0] === "uk";

describe("languageForCountry", () => {
  it("основной язык страны", () => {
    expect(languageForCountry("RU", isUnsupported)).toBe("ru");
    expect(languageForCountry("kz", isUnsupported)).toBe("ru");
    expect(languageForCountry("US", isUnsupported)).toBe("en");
    expect(languageForCountry("AT", isUnsupported)).toBe("de");
    expect(languageForCountry("MX", isUnsupported)).toBe("es");
    expect(languageForCountry("BR", isUnsupported)).toBe("pt");
    expect(languageForCountry("CN", isUnsupported)).toBe("zh-CN");
    expect(languageForCountry("TW", isUnsupported)).toBe("zh-TW");
    expect(languageForCountry("IL", isUnsupported)).toBe("he");
    expect(languageForCountry("AE", isUnsupported)).toBe("ar");
  });

  it("неподдерживаемый язык и неизвестная страна — null", () => {
    expect(languageForCountry("UA", isUnsupported)).toBeNull();
    expect(languageForCountry("AQ", isUnsupported)).toBeNull();
    expect(languageForCountry(null, isUnsupported)).toBeNull();
  });
});

describe("languageFromAcceptHeader", () => {
  it("первый подходящий по q, региональные варианты сводятся к языку", () => {
    expect(languageFromAcceptHeader("de-DE,de;q=0.9,en;q=0.8", isUnsupported)).toBe("de");
    expect(languageFromAcceptHeader("en;q=0.5, fr-CA", isUnsupported)).toBe("fr");
    expect(languageFromAcceptHeader("zh-Hant-TW,zh;q=0.8", isUnsupported)).toBe("zh-TW");
    expect(languageFromAcceptHeader("zh", isUnsupported)).toBe("zh-CN");
  });

  it("неподдерживаемые, «*», мусор и q=0 пропускаются", () => {
    expect(languageFromAcceptHeader("uk-UA,uk;q=0.9,ru;q=0.8", isUnsupported)).toBe("ru");
    expect(languageFromAcceptHeader("*", isUnsupported)).toBeNull();
    expect(languageFromAcceptHeader("xx-YY, 123", isUnsupported)).toBeNull();
    expect(languageFromAcceptHeader("en;q=0", isUnsupported)).toBeNull();
    expect(languageFromAcceptHeader(undefined, isUnsupported)).toBeNull();
  });
});

describe("normalizeLanguage", () => {
  it("старые и норвежские коды", () => {
    expect(normalizeLanguage("iw")).toBe("he");
    expect(normalizeLanguage("nb-NO")).toBe("no");
    expect(normalizeLanguage("EN_us")).toBe("en");
  });
});
