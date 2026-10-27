// Запуск без NestJS: Express-приложение (app.js) на своём HTTP-сервере плюс всё,
// что работает рядом с ним (runtime.js). Каркас NestJS — apps/api/src/main.ts.
const http = require("http");
const { app, webClientBuilt, WEB_DIST_DIR } = require("./app");
const { startRuntime } = require("./runtime");

const server = http.createServer(app);

startRuntime(server, (port) => {
  server.listen(port, "0.0.0.0", () => {
    console.log(`shalter server listening on http://localhost:${port}`);
    console.log(
      webClientBuilt()
        ? `[static] клиент — сборка ${WEB_DIST_DIR}`
        : `[static] нет сборки клиента в ${WEB_DIST_DIR} — выполните npm run build (для разработки — npm run dev:web)`
    );
  });
});
