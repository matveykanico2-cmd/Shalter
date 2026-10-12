// Рисует варианты иконки приложения (каталог — public/js/lib/appIcons.js) для всех платформ:
//   public/icons/app/           — значок вкладки и apple-touch-icon;
//   resources/android/res/      — иконки activity-alias (их включает плагин AppIcon);
//   resources/ios/              — альтернативные иконки (AppIcon-<id>.appiconset);
//   src-tauri/icons/variants/   — иконка окна и трея + список в src-tauri/src/app_icons.rs.
// Запуск: node scripts/gen-app-icons.mjs. Картинки в git, как и остальные иконки.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APP_ICONS, DEFAULT_APP_ICON, appIconSvg } from "../public/js/lib/appIcons.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => {
  const file = path.join(ROOT, ...p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};

async function png(svg, size, file, { flatten = false } = {}) {
  let img = sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 512) * 2 }).resize(size, size);
  if (flatten) img = img.flatten({ background: "#ffffff" });
  await img.png().toFile(file);
}

// Скруглённый квадрат для «старых» иконок Android (до 8.0 система форму не задаёт).
const rounded = (svg) => svg.replace(/<rect width="512" height="512"/, '<rect width="512" height="512" rx="112"');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const icon of APP_ICONS) {
  const { id } = icon;

  // Веб: значок вкладки (круг, как icon.svg) и apple-touch-icon (квадрат — углы скругляет iOS).
  await png(appIconSvg(icon), 32, out("public/icons/app", `${id}-32.png`));
  await png(appIconSvg(icon, { shape: "square" }), 180, out("public/icons/app", `${id}-180.png`), { flatten: true });

  // Десктоп: окно и трей.
  await png(appIconSvg(icon), 256, out("src-tauri/icons/variants", `${id}.png`));

  // Стандартная иконка у Android и iOS — основная иконка приложения, она уже лежит в resources/.
  if (id === DEFAULT_APP_ICON) continue;

  // Android: legacy + round + адаптивная (фон во весь квадрат, знак — в безопасной зоне).
  for (const [dpi, k] of Object.entries(DENSITIES)) {
    const dir = `resources/android/res/mipmap-${dpi}`;
    await png(rounded(appIconSvg(icon, { shape: "square" })), Math.round(48 * k), out(dir, `ic_launcher_${id}.png`));
    await png(appIconSvg(icon), Math.round(48 * k), out(dir, `ic_launcher_${id}_round.png`));
    await png(appIconSvg(icon, { shape: "square", withGlyph: false }), Math.round(108 * k), out(dir, `ic_launcher_${id}_background.png`));
    await png(appIconSvg(icon, { withBackground: false, glyphScale: 0.66 }), Math.round(108 * k), out(dir, `ic_launcher_${id}_foreground.png`));
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_${id}_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_${id}_foreground"/>
</adaptive-icon>
`;
  fs.writeFileSync(out("resources/android/res/mipmap-anydpi-v26", `ic_launcher_${id}.xml`), adaptive);
  fs.writeFileSync(out("resources/android/res/mipmap-anydpi-v26", `ic_launcher_${id}_round.xml`), adaptive);

  // iOS: альтернативная иконка — свой набор в Assets.xcassets (без прозрачности).
  const set = `resources/ios/AppIcon-${id}.appiconset`;
  await png(appIconSvg(icon, { shape: "square" }), 1024, out(set, `AppIcon-${id}.png`), { flatten: true });
  fs.writeFileSync(
    out(set, "Contents.json"),
    JSON.stringify(
      {
        images: [{ filename: `AppIcon-${id}.png`, idiom: "universal", platform: "ios", size: "1024x1024" }],
        info: { author: "xcode", version: 1 },
      },
      null,
      2
    ) + "\n"
  );
}

// Список для Rust: иконки вшиваются в бинарник десктоп-приложения.
const rs = `// Сгенерировано scripts/gen-app-icons.mjs — не править вручную.
pub const APP_ICONS: &[(&str, &[u8])] = &[
${APP_ICONS.map((i) => `    ("${i.id}", include_bytes!("../icons/variants/${i.id}.png")),`).join("\n")}
];
`;
fs.writeFileSync(out("src-tauri/src/app_icons.rs"), rs);

// Список вариантов для нативных частей (Android-манифест, iOS) — читает apply-native-resources.js.
fs.writeFileSync(
  out("resources/app-icons.json"),
  JSON.stringify({ default: DEFAULT_APP_ICON, icons: APP_ICONS.map((i) => i.id) }, null, 2) + "\n"
);

console.log(`Иконок: ${APP_ICONS.length} — веб, Android, iOS, десктоп`);
