function baseLang(code) {
  return String(code || "").toLowerCase().split("-")[0];
}

let detectorPromise = null;
async function getDetector() {
  if (typeof self === "undefined" || !("LanguageDetector" in self)) return null;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const avail = await self.LanguageDetector.availability();
        if (avail === "unavailable") return null;
        return await self.LanguageDetector.create();
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
}

const MIN_CONFIDENCE = 0.8;

async function detectLang(text) {
  const detector = await getDetector();
  if (!detector) return null;
  try {
    const results = await detector.detect(text);
    const top = results?.[0];
    if (!top || !top.detectedLanguage || top.detectedLanguage === "und") return null;
    if (typeof top.confidence === "number" && top.confidence < MIN_CONFIDENCE) return null;
    return baseLang(top.detectedLanguage);
  } catch {
    return null;
  }
}

const CREATE_TIMEOUT_MS = 3000;

const translators = new Map();
function getTranslator(sourceLanguage, targetLanguage) {
  const key = `${sourceLanguage}>${targetLanguage}`;
  let p = translators.get(key);
  if (!p) {
    p = (async () => {
      try {
        const avail = await self.Translator.availability({ sourceLanguage, targetLanguage });
        if (avail === "unavailable") return null;
        return await self.Translator.create({ sourceLanguage, targetLanguage });
      } catch {
        return null;
      }
    })();
    translators.set(key, p);
    p.then((t) => {
      if (!t && translators.get(key) === p) translators.delete(key);
    });
  }
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), CREATE_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function localTranslateSupported() {
  return typeof self !== "undefined" && "Translator" in self;
}

export async function translateLocally(text, target) {
  if (!text || !localTranslateSupported()) return null;
  const targetLanguage = baseLang(target) || "ru";
  const source = (await detectLang(text)) || null;
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
