// Языки, которых в мессенджере нет.
//
// Список — один на всё приложение, потому что «нет языка» должно значить одно и
// то же в трёх разных местах: в выборе языка интерфейса и перевода сообщений
// (Настройки → Внешний вид), в самом переводчике (routes/translate.js) и в
// проверке текста, на которой отвечает Hugo (lib/languageTool.js). Убрать пункт
// только из выпадающего списка мало: язык выставляется и запросом к API, и
// определяется автоматически по тексту, — а тогда интерфейс или ответ бота
// приезжают на языке, которого в мессенджере нет.
const UNSUPPORTED_LANGUAGES = ["uk"];

// Совпадение по префиксу: "uk", "uk-UA", "ukr" — это один и тот же язык, а
// приходит он в разных видах (из настроек, из автоопределения LanguageTool, из
// ответа Google Translate).
function isUnsupportedLanguage(code) {
  const lang = String(code ?? "").toLowerCase().split(/[-_]/)[0];
  return UNSUPPORTED_LANGUAGES.includes(lang);
}

const UNSUPPORTED_MESSAGE = "Украинский язык не поддерживается в нашем мессенджере";

module.exports = { UNSUPPORTED_LANGUAGES, isUnsupportedLanguage, UNSUPPORTED_MESSAGE };
