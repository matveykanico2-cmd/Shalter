// Обёртка для Vitest: один сервер на файл тестов.
import { afterAll, beforeAll } from "vitest";
import { startServer, type StartOptions, type TestServer } from "./server";

/** Один сервер на файл тестов: поднимается в beforeAll, гасится в afterAll. */
export function useServer(opts: StartOptions = {}): () => TestServer {
  let server: TestServer | undefined;
  beforeAll(async () => {
    server = await startServer(opts);
  });
  afterAll(async () => {
    await server?.stop();
  });
  return () => {
    if (!server) throw new Error("Сервер ещё не запущен — useServer() вызывается на верхнем уровне файла");
    return server;
  };
}
