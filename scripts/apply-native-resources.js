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
}
