// Перевод прямо на устройстве, без обращения к серверу — через встроенный в
// браузер Translator API (Chrome/Edge 138+). Он скачивает языковой пакет один
// раз, дальше переводит мгновенно и офлайн. Где API нет (Safari, Firefox,
// старый Chrome) — функции возвращают null, и вызывающий код откатывается на
// серверный перевод (api.translateText).
//
// Зачем отдельный модуль: и перевод сообщения (messageBubble.js), и перевод
// интерфейса (uiTranslate.js) должны сначала пробовать локальный путь и только
// потом сетевой — логика определения языка и кэш переводчиков тут одни на всех.

// Нормализуем код языка к тому, что понимает Translator API: он хочет базовый
// («ru», «en»), а не «ru-RU». «uk» нам всё равно не нужен (не поддерживается в
// приложении), но здесь это не фильтруется — это забота вызывающего.
function baseLang(code) {
  return String(code || "").toLowerCase().split("-")[0];
}

// Детектор языка — тоже встроенный (LanguageDetector API). Один на сессию.
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

// Ниже этой уверенности детектору не верим: на коротких и смешанных фразах
// («ok спасибо, see you tomorrow») он легко ошибается, а ошибка тут значит
// «перевод» = исходный текст. Пусть такие случаи решает сервер.
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

// Сколько ждём переводчик, прежде чем отдать перевод серверу. Если браузер ещё
// качает языковой пакет, create() ждёт всю загрузку — пузырь не должен висеть на
// «Переводим…». Загрузка при этом продолжается в фоне, и следующий перевод уже
// возьмёт готовый переводчик.
const CREATE_TIMEOUT_MS = 3000;

// Переводчики кэшируются по паре «источник→цель»: создание тянет языковой пакет,
// повторять на каждое сообщение незачем. В кэше остаются только удачные или ещё
// идущие попытки — неудачная удаляется, чтобы пару можно было попробовать снова
// (например, create() упал из-за истёкшей user activation).
const translators = new Map();
function getTranslator(sourceLanguage, targetLanguage) {
  const key = `${sourceLanguage}>${targetLanguage}`;
  let p = translators.get(key);
  if (!p) {
    p = (async () => {
      try {
        const avail = await self.Translator.availability({ sourceLanguage, targetLanguage });
        // "unavailable" — такой пары у браузера нет; "downloadable"/"downloading"/
        // "available" — создаём (create сам дождётся скачивания пакета).
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

// Доступен ли вообще локальный перевод в этом браузере.
export function localTranslateSupported() {
  return typeof self !== "undefined" && "Translator" in self;
}

// Переводит `text` на `target` на устройстве. Возвращает строку перевода или
// null, если локальный перевод недоступен/не сработал (тогда вызывающий идёт на
// сервер). Язык источника определяется сам; если уже и так целевой — возвращаем
// исходный текст (переводить нечего).
export async function translateLocally(text, target) {
  if (!text || !localTranslateSupported()) return null;
  const targetLanguage = baseLang(target) || "ru";
  const source = (await detectLang(text)) || null;
  // Без определённого источника Translator API создать нельзя. Если детектор
  // недоступен — отдаём null, пусть переводит сервер (он язык определяет сам).
  if (!source) return null;
  // Сюда доходим только при уверенном определении (см. MIN_CONFIDENCE), так что
  // «уже на целевом языке» — не догадка детектора на смешанной фразе.
  if (source === targetLanguage) return text;
  const translator = await getTranslator(source, targetLanguage);
  if (!translator) return null;
  try {
    return await translator.translate(text);
  } catch {
    return null;
  }
}
