// Запуск сервера под тесты. Сервер поднимается отдельным процессом на чистом
// временном каталоге: все модули берут путь к данным из process.cwd()/data,
// поэтому cwd = временная папка — это и есть изолированная база, uploads и outbox.
//
// Сервер — apps/api/dist/main.js (собрать: npm run build:api); старого server/index.js больше нет.
// TEST_BASE_URL=http://… — не запускать ничего, гнать тесты против уже поднятого сервера
// (тогда тесты, которым нужен доступ к каталогу данных, пропускаются).
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_KEYS } from "./env";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NET_GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "net-guard.cjs");
const FIXTURE_WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "web-dist");

/**
 * Настоящая сборка клиента для сценариев в браузере: WEB_DIST (vite build --outDir …) или
 * apps/web/dist (npm run build:web).
 */
export function webBuild(): string {
  const dir = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : path.join(REPO_ROOT, "apps", "web", "dist");
  if (!fs.existsSync(path.join(dir, "index.html"))) throw new Error(`нет сборки клиента ${dir} — сначала npm run build:web`);
  return dir;
}

export interface TestServer {
  baseUrl: string;
  /** Каталог data/ сервера; null, если сервер внешний (TEST_BASE_URL). */
  dataDir: string | null;
  /** Последние строки лога сервера — для сообщений об ошибках. */
  log(): string;
  /** keepData — не удалять временную папку (например, чтобы перезапустить сервер на тех же данных). */
  stop(opts?: { keepData?: boolean }): Promise<void>;
}

export interface StartOptions {
  /** Готовый каталог data/ (например, фикстура совместимости) — копируется во временную папку. */
  seedDataDir?: string;
  env?: Record<string, string>;
  /**
   * Сборка клиента, которую отдаёт сервер: по умолчанию — заглушка fixtures/web-dist (контрактным
   * тестам раздачи настоящая сборка не нужна); сценариям в браузере — apps/web/dist (webBuild()).
   */
  webDist?: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function entryFor(target: string): string {
  if (target !== "nest") throw new Error(`Неизвестный TARGET=${target}: старый сервер (server/index.js) удалён, остался только nest`);
  const entry = path.join(REPO_ROOT, "apps", "api", "dist", "main.js");
  if (!fs.existsSync(entry)) throw new Error(`нет ${entry} — сначала npm run build:api`);
  return entry;
}

async function waitReady(baseUrl: string, child: ChildProcess, log: () => string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Сервер завершился с кодом ${child.exitCode}\n${log()}`);
    try {
      const res = await fetch(`${baseUrl}/api/version`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Сервер не ответил за ${timeoutMs} мс\n${log()}`);
}

/** Записи сторожа сети: «connect host:port» / «dns host» и откуда вызвано. */
function readNetAttempts(file: string): string[] {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const seen = new Set<string>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const { kind, target, stack } = JSON.parse(line) as { kind: string; target: string; stack: string[] };
    seen.add(`  ${kind} ${target}${stack[0] ? `  (${stack[0]})` : ""}`);
  }
  return [...seen];
}

export async function startServer(opts: StartOptions = {}): Promise<TestServer> {
  if (process.env.TEST_BASE_URL) {
    return { baseUrl: process.env.TEST_BASE_URL.replace(/\/+$/, ""), dataDir: null, log: () => "", stop: async () => {} };
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-test-"));
  const dataDir = path.join(root, "data");
  if (opts.seedDataDir) fs.cpSync(opts.seedDataDir, dataDir, { recursive: true, preserveTimestamps: true });
  else fs.mkdirSync(dataDir);

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logFile = path.join(root, "server.log");
  const netLogFile = path.join(root, "net-guard.log");
  const out = fs.openSync(logFile, "a");

  // Окружение собирается с нуля: настройки разработчика (SMTP, S3, ключи AI,
  // платёжки) не должны протечь в тесты и отправить что-то наружу.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? root,
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    NODE_ENV: "test",
    PORT: String(port),
    SHALTER_TEST_MODE: "1",
    MAIL_DIRECT: "0",
    MAIL_OUTBOX: "1",
    LOCAL_VISION: "off",
    API_RATE_LIMIT: "1000000",
    AUTH_RATE_LIMIT: "1000000",
    // Сервисы, у которых в server/config.js и lib/* есть публичный адрес по
    // умолчанию: тесты не должны ходить в интернет. 127.0.0.1:9 отказывает сразу.
    HUGO_AI: "off",
    LANGUAGETOOL_URL: "http://127.0.0.1:9/v2/check",
    HF_VISION_SPACE: "http://127.0.0.1:9",
    FLUX_SPACE_URL: "http://127.0.0.1:9",
    MESSAGES_KEY: TEST_KEYS.messages,
    UPLOADS_KEY: TEST_KEYS.uploads,
    // Сторож сети (net-guard.cjs): соединения и DNS-запросы не на loopback
    // отклоняются и записываются; stop() падает, если такие были.
    NODE_OPTIONS: `--require "${NET_GUARD}"`,
    SHALTER_NET_GUARD_LOG: netLogFile,
    SHALTER_WEB_DIST: opts.webDist ?? FIXTURE_WEB_DIST,
    ...opts.env,
  };

  const child = spawn(process.execPath, [entryFor(process.env.TARGET ?? "nest")], {
    cwd: root,
    env,
    stdio: ["ignore", out, out],
  });
  const log = () => {
    try {
      return fs.readFileSync(logFile, "utf8").split("\n").slice(-60).join("\n");
    } catch {
      return "";
    }
  };

  try {
    await waitReady(baseUrl, child, log);
  } catch (err) {
    child.kill("SIGKILL");
    throw err;
  }

  return {
    baseUrl,
    dataDir,
    log,
    async stop({ keepData = false }: { keepData?: boolean } = {}) {
      if (child.exitCode === null) {
        const exited = new Promise((r) => child.once("exit", r));
        child.kill("SIGTERM");
        await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
      fs.closeSync(out);
      const attempts = readNetAttempts(netLogFile);
      fs.rmSync(netLogFile, { force: true });
      if (!keepData && process.env.KEEP_TEST_DATA !== "1") fs.rmSync(root, { recursive: true, force: true });
      if (attempts.length) {
        throw new Error(`Сервер пытался выйти в сеть — тесты должны работать без неё. Заглушите адрес (см. packages/contract-tests/contract/integrations/stubs.ts):\n${attempts.join("\n")}`);
      }
    },
  };
}
