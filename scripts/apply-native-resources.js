// Иконки и заставки Shalter для Capacitor-проектов. android/ и ios/ не в git и в CI
// создаются заново (`npx cap add …`) — со стандартной иконкой Capacitor. Готовые
// ресурсы лежат в resources/ и копируются поверх: `node scripts/apply-native-resources.js [android|ios]`.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGETS = {
  android: { from: "resources/android/res", to: "android/app/src/main/res" },
  ios: { from: "resources/ios", to: "ios/App/App/Assets.xcassets" },
};

const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(TARGETS)) {
  const target = TARGETS[name];
  if (!target) throw new Error(`неизвестная платформа: ${name}`);
  const to = path.join(ROOT, target.to);
  if (!fs.existsSync(to)) {
    console.log(`${name}: нет ${target.to} — сначала npx cap add ${name}`);
    continue;
  }
  fs.cpSync(path.join(ROOT, target.from), to, { recursive: true });
  console.log(`${name}: иконки и заставки → ${target.to}`);
  if (name === "android") dropPrecompressed(path.join(ROOT, "android/app/src/main/assets/public"));
}

// Сборка (scripts/build.js) кладёт рядом с app.js сжатые копии app.js.gz/.br для
// сервера. Android при упаковке отбрасывает «.gz», и app.js.gz сталкивается с app.js
// («Duplicate resources»). Приложению они не нужны — оно грузит сайт с server.url.
function dropPrecompressed(dir) {
  if (!fs.existsSync(dir)) return;
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /\.(gz|br)$/.test(entry.name)) {
      fs.rmSync(path.join(entry.parentPath ?? entry.path, entry.name));
      removed++;
    }
  }
  console.log(`android: убрано сжатых копий .gz/.br — ${removed}`);
}
