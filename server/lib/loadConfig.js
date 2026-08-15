const path = require("path");

// Настройки из файлов — прочитанные самим приложением, а не флагами запуска.
//
// Флаги `--env-file-if-exists` в npm start / ecosystem.config.js / Dockerfile
// работают ровно до тех пор, пока процесс запускают именно ими. А запускают его
// по-разному: из IDE, командой `node server/index.js`, платформой, которая
// подставляет свою команду вместо CMD. Во всех этих случаях конфигурация молча
// оказывалась пустой — SMTP считался ненастроенным, письма не уходили, и понять
// это можно было только по дефолтному адресу отправителя в админке.
//
// Отсюда правило: файл настроек читает приложение, а не тот, кто его запускает.
// Модуль подключается первой строкой server/index.js, до всего, что смотрит в
// process.env.
//
// Порядок — от менее приоритетного к более, потому что process.loadEnvFile()
// не перезаписывает уже установленные значения (проверено): сначала config.env
// из репозитория, поверх него .env этой машины, а настоящие переменные
// окружения перекрывают оба, так как они были в process.env изначально.
const FILES = ["config.env", ".env"];

function loadConfigFiles(dir = process.cwd()) {
  const loaded = [];
  for (const file of FILES) {
    try {
      process.loadEnvFile(path.join(dir, file));
      loaded.push(file);
    } catch (err) {
      // Отсутствие файла — обычное дело: на одной машине есть только .env, на
      // другой только config.env, на третьей ни одного. Всё остальное стоит
      // назвать вслух: битый файл иначе выглядит как «настройки не применились».
      if (err?.code !== "ENOENT") console.warn(`[config] ${file} не прочитан: ${err.message}`);
    }
  }
  return loaded;
}

// Порядок здесь важнее аккуратности: сработать нужно на require, до того как
// server/config.js и остальные прочитают process.env.
const loaded = loadConfigFiles();
if (loaded.length) console.log(`[config] настройки прочитаны из: ${loaded.join(", ")}`);

module.exports = { loadConfigFiles, FILES };
