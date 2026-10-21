// Запасная геолокация (/api/geo): место по IP (ipwho.is, затем get.geojs.io) и
// поиск адреса (nominatim.openstreetmap.org). Адреса сервисов зашиты в код,
// поэтому весь исходящий fetch сервера идёт через локальный CONNECT-прокси в
// HTTPS-заглушку (push/tls.ts) — в интернет тесты не выходят.
import { beforeEach, describe, expect, test } from "vitest";
import { geoIpBody, geoSearchBody } from "../../schemas/geo";
import { expectError, expectOk } from "../../support/expect";
import { registerUser, type TestUser } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { json, useTlsEgress } from "../push/tls";
import { expectAll401 } from "../stars/helpers";

const IPWHO = "ipwho.is";
const GEOJS = "get.geojs.io";
const OSM = "nominatim.openstreetmap.org";
const UA = "Shalter/1.0 (https://shalter.ru)";

const env: Record<string, string> = {};
const egress = useTlsEgress(env, [IPWHO, GEOJS, OSM]);
const server = useServer({ env });

let me: TestUser;
async function user(): Promise<TestUser> {
  me ??= await registerUser(server().baseUrl);
  return me;
}

beforeEach(() => {
  egress.site().routes.clear();
  egress.site().hits.length = 0;
});

const hitsTo = (host: string) => egress.site().hits.filter((h) => h.host === host);

describe("без сессии", () => {
  test("GET /api/geo/ip и /api/geo/search — 401 unauthorized", async () => {
    await expectAll401(server().baseUrl, [
      ["GET", "/api/geo/ip"],
      ["GET", "/api/geo/search"],
    ]);
    expect(egress.site().hits).toEqual([]);
  });
});

describe("GET /api/geo/ip", () => {
  test("локальный адрес клиента — ipwho.is без IP в пути (определит сам), ответ lat/lng/city", async () => {
    egress.site().routes.set(`${IPWHO}/`, json({ success: true, latitude: 55.75, longitude: 37.62, city: "Москва", region: "Москва", country: "Россия" }));
    const body = expectOk(await (await user()).api.get("/api/geo/ip"), geoIpBody);
    expect(body).toEqual({ lat: 55.75, lng: 37.62, city: "Москва" });
    const [hit] = hitsTo(IPWHO);
    expect(hit.path).toBe("/");
    expect(hit.query.get("lang")).toBe("ru");
    expect(hit.headers["user-agent"]).toBe(UA);
    expect(hitsTo(GEOJS)).toEqual([]);
  });

  test("публичный адрес из X-Forwarded-For уходит в путь; город — city, иначе region, иначе country", async () => {
    egress.site().routes.set(`${IPWHO}/8.8.8.8`, json({ success: true, latitude: 37.4, longitude: -122.1, city: "", region: "California", country: "US" }));
    const body = expectOk(await (await user()).api.get("/api/geo/ip", { headers: { "x-forwarded-for": "8.8.8.8" } }), geoIpBody);
    expect(body).toEqual({ lat: 37.4, lng: -122.1, city: "California" });

    egress.site().routes.set(`${IPWHO}/1.1.1.1`, json({ success: true, latitude: 1, longitude: 2, country: "AU" }));
    expect(expectOk(await me.api.get("/api/geo/ip", { headers: { "x-forwarded-for": "1.1.1.1" } }), geoIpBody)).toEqual({ lat: 1, lng: 2, city: "AU" });

    egress.site().routes.set(`${IPWHO}/9.9.9.9`, json({ success: true, latitude: 3, longitude: 4 }));
    expect(expectOk(await me.api.get("/api/geo/ip", { headers: { "x-forwarded-for": "9.9.9.9" } }), geoIpBody)).toEqual({ lat: 3, lng: 4, city: "" });
  });

  test("частный адрес в X-Forwarded-For считается локальным — путь без IP", async () => {
    egress.site().routes.set(`${IPWHO}/`, json({ success: true, latitude: 10, longitude: 20, city: "Где-то" }));
    for (const ip of ["10.1.2.3", "192.168.0.5", "172.20.0.1"]) {
      expectOk(await (await user()).api.get("/api/geo/ip", { headers: { "x-forwarded-for": ip } }), geoIpBody);
    }
    expect(hitsTo(IPWHO).map((h) => h.path)).toEqual(["/", "/", "/"]);
  });

  test("ipwho.is ответил success:false — запасной get.geojs.io (числа строками)", async () => {
    egress.site().routes.set(`${IPWHO}/8.8.4.4`, json({ success: false, message: "limit" }));
    egress.site().routes.set(`${GEOJS}/v1/ip/geo/8.8.4.4.json`, json({ latitude: "48.85", longitude: "2.35", city: "Paris" }));
    const body = expectOk(await (await user()).api.get("/api/geo/ip", { headers: { "x-forwarded-for": "8.8.4.4" } }), geoIpBody);
    expect(body).toEqual({ lat: 48.85, lng: 2.35, city: "Paris" });
    const [hit] = hitsTo(GEOJS);
    expect(hit.headers["user-agent"]).toBe(UA);
  });

  test("ipwho.is вернул 0,0 — не годится, берётся get.geojs.io (локальный путь /v1/ip/geo.json)", async () => {
    egress.site().routes.set(`${IPWHO}/`, json({ success: true, latitude: 0, longitude: 0, city: "Null Island" }));
    egress.site().routes.set(`${GEOJS}/v1/ip/geo.json`, json({ latitude: "59.94", longitude: "30.31", region: "Санкт-Петербург" }));
    const body = expectOk(await (await user()).api.get("/api/geo/ip"), geoIpBody);
    expect(body).toEqual({ lat: 59.94, lng: 30.31, city: "Санкт-Петербург" });
  });

  test("оба сервиса не ответили (HTTP-ошибка, мусор) — 503", async () => {
    egress.site().routes.set(`${IPWHO}/`, json({ error: "boom" }, 500));
    egress.site().routes.set(`${GEOJS}/v1/ip/geo.json`, json({ latitude: "abc", longitude: null }));
    expectError(await (await user()).api.get("/api/geo/ip"), 503, "Не удалось определить местоположение по сети");
    expect(hitsTo(IPWHO)).toHaveLength(1);
    expect(hitsTo(GEOJS)).toHaveLength(1);
  });
});

describe("GET /api/geo/search", () => {
  test("пустой или пробельный запрос — пустой список без обращения к OSM", async () => {
    const u = await user();
    expect(expectOk(await u.api.get("/api/geo/search"), geoSearchBody)).toEqual({ places: [] });
    expect(expectOk(await u.api.get("/api/geo/search", { query: { q: "   " } }), geoSearchBody)).toEqual({ places: [] });
    expect(egress.site().hits).toEqual([]);
  });

  test("ответ nominatim → места (lat/lng числами, name из display_name), мусорные строки отброшены", async () => {
    egress.site().routes.set(
      `${OSM}/search`,
      json([
        { lat: "55.7558", lon: "37.6173", display_name: "Москва, Россия", place_id: 1 },
        { lat: "abc", lon: "37", display_name: "битая" },
        { lat: "59.9", lon: "30.3" },
      ])
    );
    const body = expectOk(await (await user()).api.get("/api/geo/search", { query: { q: "  Тверская 1  " } }), geoSearchBody);
    expect(body).toEqual({
      places: [
        { lat: 55.7558, lng: 37.6173, name: "Москва, Россия" },
        { lat: 59.9, lng: 30.3, name: "" },
      ],
    });
    const [hit] = hitsTo(OSM);
    expect(Object.fromEntries(hit.query)).toEqual({ format: "jsonv2", limit: "6", "accept-language": "ru", q: "Тверская 1" });
    expect(hit.headers["user-agent"]).toBe(UA);
  });

  test("запрос обрезается до 200 символов; не-массив в ответе — пустой список", async () => {
    egress.site().routes.set(`${OSM}/search`, json({ error: "unexpected" }));
    const body = expectOk(await (await user()).api.get("/api/geo/search", { query: { q: "я".repeat(250) } }), geoSearchBody);
    expect(body).toEqual({ places: [] });
    expect(hitsTo(OSM)[0].query.get("q")).toBe("я".repeat(200));
  });

  test("OSM недоступен (HTTP-ошибка) — 503", async () => {
    egress.site().routes.set(`${OSM}/search`, json({ error: "busy" }, 429));
    expectError(await (await user()).api.get("/api/geo/search", { query: { q: "Казань" } }), 503, "Поиск адресов сейчас недоступен");
  });
});

describe("исходящие соединения", () => {
  test("сервер ходил только к трём геосервисам", () => {
    expect(new Set(egress.connects.filter((c) => !c.startsWith("127.0.0.1")))).toEqual(new Set([`${IPWHO}:443`, `${GEOJS}:443`, `${OSM}:443`]));
  });
});
