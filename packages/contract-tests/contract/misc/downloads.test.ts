// Страница загрузок: GET /api/downloads (какие сборки есть) и GET /api/downloads/latest
// (обновление нативной оболочки). Сборки берутся из public/downloads репозитория,
// недостающие — из последнего релиза на GitHub (api.github.com зашит в код).
// Наружу тесты не ходят: весь исходящий fetch сервера идёт через локальный прокси,
// который GitHub не пропускает — сервер ведёт себя как при недоступном GitHub.
//
// В репозитории лежат только Shalter.apk и versions.json (без android), поэтому:
// android — локальный файл, остальные платформы — недоступны.
import { describe, expect, test } from "vitest";
import { downloadsBody, DOWNLOAD_IDS, latestBody } from "../../schemas/misc";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { useServer } from "../../support/use-server";
import { useEgressProxy } from "../integrations/stubs";

const egress = useEgressProxy();
const server = useServer({ env: egress.env });

describe("GET /api/downloads", () => {
  test("без сессии; список платформ в фиксированном порядке; GitHub недоступен — только локальные сборки", async () => {
    const res = await new Api(server().baseUrl).get("/api/downloads");
    const body = expectOk(res, downloadsBody);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.artifacts.map((a) => a.id)).toEqual([...DOWNLOAD_IDS]);
    expect(body.artifacts.filter((a) => a.id !== "android")).toEqual([
      { id: "windows", available: false },
      { id: "linux", available: false },
      { id: "linux-deb", available: false },
      { id: "macos-arm64", available: false },
    ]);
    expect(body.artifacts.find((a) => a.id === "android")).toEqual({ id: "android", available: true, url: "/downloads/Shalter.apk", size: expect.any(Number), updatedAt: expect.any(String) });

    // Сервер пытался спросить последний релиз у GitHub.
    expect(egress.proxy().connects).toContain("api.github.com:443");
  });

  test("ссылка на локальную сборку отдаёт файл", async () => {
    const res = await fetch(new URL("/downloads/Shalter.apk", server().baseUrl), { method: "HEAD" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/downloads/latest", () => {
  test("ни NATIVE_LATEST_VERSION, ни релиза — { version: null } для любой платформы", async () => {
    const api = new Api(server().baseUrl);
    for (const platform of ["windows", "linux", "linux-deb", "macos-arm64", "android", "ios", "nope", undefined]) {
      const res = await api.get("/api/downloads/latest", { query: { platform } });
      expect(expectOk(res, latestBody), `platform=${platform}`).toEqual({ version: null });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
