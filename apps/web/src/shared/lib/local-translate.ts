// Перевод на устройстве встроенным переводчиком Chrome (Translator и LanguageDetector) —
// порт public/js/lib/localTranslate.js. Запасной путь, когда сервер не перевёл.

type Detector = { detect: (text: string) => Promise<{ detectedLanguage?: string; confidence?: number }[]> };
type Translator = { translate: (text: string) => Promise<string> };
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
type BrowserAi = {
  LanguageDetector?: { availability: () => Promise<Availability>; create: () => Promise<Detector> };
  Translator?: {
    availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<Availability>;
    create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<Translator>;
  };
};

const ai = () => globalThis as unknown as BrowserAi;
const baseLang = (code: string | null | undefined) => String(code || "").toLowerCase().split("-")[0] ?? "";

const MIN_CONFIDENCE = 0.8;
const CREATE_TIMEOUT_MS = 3000;

let detectorPromise: Promise<Detector | null> | null = null;
function getDetector() {
  const api = ai().LanguageDetector;
  if (!api) return Promise.resolve(null);
  detectorPromise ??= (async () => {
    try {
      if ((await api.availability()) === "unavailable") return null;
      return await api.create();
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

async function detectLang(text: string) {
  const detector = await getDetector();
  if (!detector) return null;
  try {
    const top = (await detector.detect(text))?.[0];
    if (!top?.detectedLanguage || top.detectedLanguage === "und") return null;
    if (typeof top.confidence === "number" && top.confidence < MIN_CONFIDENCE) return null;
    return baseLang(top.detectedLanguage);
  } catch {
    return null;
  }
}

const translators = new Map<string, Promise<Translator | null>>();
function getTranslator(sourceLanguage: string, targetLanguage: string) {
  const api = ai().Translator;
  if (!api) return Promise.resolve(null);
  const key = `${sourceLanguage}>${targetLanguage}`;
  let p = translators.get(key);
  if (!p) {
    const created = (async () => {
      try {
        if ((await api.availability({ sourceLanguage, targetLanguage })) === "unavailable") return null;
        return await api.create({ sourceLanguage, targetLanguage });
      } catch {
        return null;
      }
    })();
    p = created;
    translators.set(key, created);
    void created.then((t) => {
      if (!t && translators.get(key) === created) translators.delete(key);
    });
  }
  // Модель может скачиваться долго — не ждём дольше 3 с.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CREATE_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export const localTranslateSupported = () => "Translator" in globalThis;

/** Перевод или null — переводчика нет, язык не распознан, модель не загрузилась. */
export async function translateLocally(text: string, target: string) {
  if (!text || !localTranslateSupported()) return null;
  const targetLanguage = baseLang(target) || "ru";
  const source = await detectLang(text);
  if (!source) return null;
  if (source === targetLanguage) return text;
  const translator = await getTranslator(source, targetLanguage);
  if (!translator) return null;
  try {
    return await translator.translate(text);
  } catch {
    return null;
  }
}
