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
  if (name === "ios") describeIosPermissions();
  if (name === "android") {
    // Свой нативный код (MainActivity + плагин SystemBars) поверх сгенерированного.
    fs.cpSync(path.join(ROOT, "resources/android/java"), path.join(ROOT, "android/app/src/main/java/ru/shalter/app"), { recursive: true });
    pinDebugSigningKey();
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
    console.log("android: нет google-services.json — Firebase выключен, уведомления через фоновую службу (lib/nativeNotify.js)");
  } else {
    console.log("android: google-services.json на месте — push-уведомления включены");
  }

  const manifestPath = path.join(ROOT, "android/app/src/main/AndroidManifest.xml");
  let manifest = fs.readFileSync(manifestPath, "utf8");
  // Фоновая служба (lib/nativeNotify.js): держит приложение на связи без Firebase.
  if (!manifest.includes("AndroidForegroundService")) {
    manifest = manifest
      .replace(
        /<application([^>]*)>/,
        `<application$1>
        <receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" />
        <service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:foregroundServiceType="remoteMessaging" />`
      );
  }
  // Клавиатура должна сжимать окно, а не наезжать на поле ввода (вместе с
  // Keyboard.resizeOnFullScreen в capacitor.config.json — на Android 15 окно во весь экран).
  if (!manifest.includes("windowSoftInputMode")) {
    manifest = manifest.replace(/<activity\b/, '<activity android:windowSoftInputMode="adjustResize"');
  }
  // Каждое разрешение — отдельно, чтобы повторный запуск дописал недостающие.
  // CAMERA/RECORD_AUDIO/MODIFY_AUDIO_SETTINGS: без них в манифесте WebView отказывал
  // getUserMedia, не спрашивая, — звонки, голосовые и кружки на Android не работали.
  for (const perm of ["FOREGROUND_SERVICE", "FOREGROUND_SERVICE_REMOTE_MESSAGING", "POST_NOTIFICATIONS", "READ_CONTACTS", "CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]) {
    const line = `<uses-permission android:name="android.permission.${perm}" />`;
    if (!manifest.includes(`android.permission.${perm}"`)) manifest = manifest.replace("</manifest>", `    ${line}\n</manifest>`);
  }
  // Разрешение CAMERA иначе делает камеру обязательной — телефоны без неё не смогут поставить приложение.
  if (!manifest.includes("android.hardware.camera\"")) {
    manifest = manifest.replace("</manifest>", `    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>`);
  }
  if (!manifest.includes("default_notification_icon")) {
    manifest = manifest.replace(
      /<application([^>]*)>/,
      `<application$1>
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_shalter" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/ic_launcher_background" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />`
    );
  }
  fs.writeFileSync(manifestPath, manifest);
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

// iOS: без строк «зачем приложению камера/микрофон/контакты» Apple отклоняет сборку,
// а без ITSAppUsesNonExemptEncryption каждая загрузка ждёт ручного ответа про шифрование.
function describeIosPermissions() {
  const plistPath = path.join(ROOT, "ios/App/App/Info.plist");
  if (!fs.existsSync(plistPath)) return;
  let plist = fs.readFileSync(plistPath, "utf8");
  const entries = {
    NSCameraUsageDescription: "<string>Камера нужна для видеозвонков, видеосообщений и фото.</string>",
    NSMicrophoneUsageDescription: "<string>Микрофон нужен для звонков и голосовых сообщений.</string>",
    NSContactsUsageDescription: "<string>Чтобы найти друзей, которые уже пользуются Shalter.</string>",
    NSPhotoLibraryUsageDescription: "<string>Чтобы отправлять фото и видео из галереи.</string>",
    NSPhotoLibraryAddUsageDescription: "<string>Чтобы сохранять фото и видео из чатов.</string>",
    ITSAppUsesNonExemptEncryption: "<false/>",
  };
  for (const [key, value] of Object.entries(entries)) {
    if (plist.includes(`<key>${key}</key>`)) continue;
    const at = plist.lastIndexOf("</dict>");
    plist = `${plist.slice(0, at)}\t<key>${key}</key>\n\t${value}\n${plist.slice(at)}`;
  }
  fs.writeFileSync(plistPath, plist);
  console.log("ios: описания разрешений в Info.plist");
}

// Постоянный ключ для debug-сборок (resources/android/debug.keystore). Иначе каждая
// сборка в CI подписывалась новым случайным ключом, и Android не ставил новую версию
// поверх старой («конфликт пакетов»). Прописываем явно в build.gradle: положить файл
// в ~/.android недостаточно — на раннере Android-инструменты ищут его в другом месте.
function pinDebugSigningKey() {
  const gradlePath = path.join(ROOT, "android/app/build.gradle");
  let gradle = fs.readFileSync(gradlePath, "utf8");
  if (gradle.includes("shalterDebugKey")) return;
  gradle = gradle.replace(
    /android \{\n/,
    `android {
    // shalterDebugKey — scripts/apply-native-resources.js
    signingConfigs {
        debug {
            storeFile file("\${rootDir}/../resources/android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
`
  );
  fs.writeFileSync(gradlePath, gradle);
  console.log("android: debug-сборки подписываются постоянным ключом");
}
