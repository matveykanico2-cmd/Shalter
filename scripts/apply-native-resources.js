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
  if (name === "android") {
    dropPrecompressed(path.join(ROOT, "android/app/src/main/assets/public"));
    wirePushNotifications();
  }
}

// Push через Firebase: google-services.json (файл resources/android/google-services.json
// или секрет GOOGLE_SERVICES_JSON в CI) — без него android/app/build.gradle не подключает
// Firebase, и уведомлений нет. Плюс белая иконка и канал для уведомлений, которые
// Android показывает сам, пока приложение закрыто.
function wirePushNotifications() {
  const target = path.join(ROOT, "android/app/google-services.json");
  const file = path.join(ROOT, "resources/android/google-services.json");
  if (process.env.GOOGLE_SERVICES_JSON) fs.writeFileSync(target, process.env.GOOGLE_SERVICES_JSON);
  else if (fs.existsSync(file)) fs.copyFileSync(file, target);
  if (!fs.existsSync(target)) {
    // Без Firebase вызов register() роняет приложение («Default FirebaseApp is not
    // initialized») — выключаем плагин целиком: приложение работает, просто без push.
    dropAndroidPlugin("@capacitor/push-notifications", "capacitor-push-notifications");
    console.log("android: НЕТ google-services.json — push-плагин выключен, уведомлений не будет");
  } else {
    console.log("android: google-services.json на месте — push-уведомления включены");
  }

  const manifestPath = path.join(ROOT, "android/app/src/main/AndroidManifest.xml");
  let manifest = fs.readFileSync(manifestPath, "utf8");
  if (!manifest.includes("default_notification_icon")) {
    manifest = manifest.replace(
      /<application([^>]*)>/,
      `<application$1>
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_shalter" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/ic_launcher_background" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />`
    );
    fs.writeFileSync(manifestPath, manifest);
  }
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

function dropAndroidPlugin(pkg, gradleName) {
  const pluginsJson = path.join(ROOT, "android/app/src/main/assets/capacitor.plugins.json");
  if (fs.existsSync(pluginsJson)) {
    const list = JSON.parse(fs.readFileSync(pluginsJson, "utf8")).filter((p) => p.pkg !== pkg);
    fs.writeFileSync(pluginsJson, JSON.stringify(list, null, "\t"));
  }
  for (const file of ["android/capacitor.settings.gradle", "android/app/capacitor.build.gradle"]) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const kept = fs.readFileSync(full, "utf8").split("\n").filter((line) => !line.includes(`:${gradleName}'`));
    fs.writeFileSync(full, kept.join("\n"));
  }
}
