const path = require("path");

const FILES = ["config.env", ".env"];

function loadConfigFiles(dir = process.cwd()) {
  const loaded = [];
  for (const file of FILES) {
    try {
      process.loadEnvFile(path.join(dir, file));
      loaded.push(file);
    } catch (err) {
      if (err?.code !== "ENOENT") console.warn(`[config] ${file} не прочитан: ${err.message}`);
    }
  }
  return loaded;
}

const loaded = loadConfigFiles();
if (loaded.length) console.log(`[config] настройки прочитаны из: ${loaded.join(", ")}`);

module.exports = { loadConfigFiles, FILES };
