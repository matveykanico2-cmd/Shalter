// GET /api/downloads/latest с версией, заданной вручную (NATIVE_LATEST_VERSION,
// IOS_APP_URL). GitHub недоступен (прокси его не пропускает), поэтому ссылки —
// только на локальные сборки из public/downloads (в репозитории — лишь Shalter.apk).
import { describe, expect, test } from "vitest";
import { latestBody } from "../../schemas/misc";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { useServer } from "../../support/use-server";
import { useEgressProxy } from "../integrations/stubs";

const egress = useEgressProxy();
const server = useServer({ env: Object.assign(egress.env, { NATIVE_LATEST_VERSION: "9.9.9", IOS_APP_URL: "https://apps.example/shalter" }) });

async function latest(platform?: string) {
  return expectOk(await new Api(server().baseUrl).get("/api/downloads/latest", { query: { platform } }), latestBody);
}

describe("GET /api/downloads/latest (NATIVE_LATEST_VERSION)", () => {
  test("iOS — ссылка из IOS_APP_URL", async () => {
    expect(await latest("ios")).toEqual({ version: "9.9.9", url: "https://apps.example/shalter", page: "/download" });
  });

  test("десктоп без сборки (ни локально, ни в релизе) — обновление не предлагается", async () => {
    for (const platform of ["windows", "linux", "linux-deb", "macos-arm64"]) {
      expect(await latest(platform), platform).toEqual({ version: null });
    }
  });

  test("неизвестная или пустая платформа — версия без ссылки", async () => {
    expect(await latest("nope")).toEqual({ version: "9.9.9", url: null, page: "/download" });
    expect(await latest()).toEqual({ version: "9.9.9", url: null, page: "/download" });
  });

  test("android: локальный APK, если он подписан не отладочным ключом", async () => {
    // Зависит от того, чем подписан public/downloads/Shalter.apk: отладочный APK
    // поверх release-версии не встанет, и тогда обновление не предлагается.
    const body = await latest("android");
    expect([{ version: null }, { version: "9.9.9", url: "/downloads/Shalter.apk", page: "/download" }]).toContainEqual(body);
  });
});
