// Новый клиент (этап 4). Пишется параллельно с public/ и переключается целиком, когда
// сценарии Playwright зелёные на нём. В разработке API, WebSocket и файлы берутся у
// бэкенда (npm run dev или apps/api) через прокси — cookie сессии остаются своими.
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const backend = process.env.SHALTER_API_URL ?? "http://localhost:3000";
const proxy = {
  "/api": { target: backend },
  "/ws": { target: backend, ws: true },
  "/uploads": { target: backend },
  // Анимации стикеров, подарков и эмодзи и их плеер — отдаёт бэкенд (src/shared/lib/anim).
  "/tgs": { target: backend },
  "/gift-emoji": { target: backend },
  "/js/vendor": { target: backend },
  // Эмодзи картинками (src/shared/ui/emoji-text.tsx).
  "/img/emoji": { target: backend },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, proxy },
  preview: { port: 5174, proxy },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
