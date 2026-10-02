const db = require("../db");

const MAX_TEXT_LEN = 2000;

function getCachedTranslations(lang, texts) {
  const out = new Map();
  const stmt = db.prepare("SELECT translated FROM translation_cache WHERE lang = ? AND text = ?");
  for (const text of texts) {
    const row = stmt.get(lang, text);
    if (row) out.set(text, row.translated);
  }
  return out;
}

const saveMany = db.transaction((lang, entries) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO translation_cache (lang, text, translated) VALUES (?, ?, ?)");
  for (const [text, translated] of entries) {
    if (text.length <= MAX_TEXT_LEN && translated) stmt.run(lang, text, translated);
  }
});

function saveTranslations(lang, entries) {
  if (entries.length) saveMany(lang, entries);
}

module.exports = { getCachedTranslations, saveTranslations };
