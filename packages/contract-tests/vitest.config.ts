import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["contract/**/*.test.ts", "compat/**/*.test.ts", "unit/**/*.test.ts"],
    // Каждый файл контрактных тестов поднимает свой сервер на своём порту и
    // своей временной базе — файлы спокойно идут параллельно.
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Внутри файла тесты идут по порядку: многие сценарии продолжают предыдущий.
    sequence: { concurrent: false },
  },
});
