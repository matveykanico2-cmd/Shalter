// Запуск без NestJS: Express-приложение (app.js) на своём HTTP-сервере плюс всё,
// что работает рядом с ним (runtime.js). Каркас NestJS — apps/api/src/main.ts.
const http = require("http");
const { app, useBuilt } = require("./app");
const { startRuntime } = require("./runtime");

const server = http.createServer(app);

startRuntime(server, (port) => {
  server.listen(port, "0.0.0.0", () => {
    console.log(`shalter server listening on http://localhost:${port}`);
    console.log(
      useBuilt
        ? "[static] отдаём собранную версию из public/dist (один файл, сжатый заранее)"
        : "[static] отдаём исходники из public/ — для боевого сервера выполните npm run build"
    );
  });
});
