// Сценарии в браузере (Playwright). Сервер поднимается фикстурой уровня воркера
// (tests/e2e/support/fixtures.ts): у каждого воркера свой процесс сервера и своя
// временная база, поэтому файлы спокойно идут параллельно.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "./e2e/.report" }]] : "list",
  outputDir: "./e2e/.results",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    // Камера и микрофон — фейковые: звонки и голосовые без диалогов разрешений.
    permissions: ["camera", "microphone"],
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
  ],
});
