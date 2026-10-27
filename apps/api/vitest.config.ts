import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ["src/**/*.spec.ts"],
    testTimeout: 30_000,
  },
});
