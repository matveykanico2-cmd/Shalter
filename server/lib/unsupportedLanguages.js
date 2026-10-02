const UNSUPPORTED_LANGUAGES = ["uk"];

function isUnsupportedLanguage(code) {
  const lang = String(code ?? "").toLowerCase().split(/[-_]/)[0];
  return UNSUPPORTED_LANGUAGES.includes(lang);
}

const UNSUPPORTED_MESSAGE = "Украинский язык не поддерживается в нашем мессенджере";

module.exports = { UNSUPPORTED_LANGUAGES, isUnsupportedLanguage, UNSUPPORTED_MESSAGE };
