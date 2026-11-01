import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";

// Запасной путь для «Геолокации», когда телефон не отдаёт координаты (нет разрешения,
// выключен GPS, старая сборка приложения): примерное место по IP и поиск адреса через
// OpenStreetMap — как server/routes/geo.js. Оба сервиса бесплатны и без ключа.
const UA = { "User-Agent": "Shalter/1.0 (https://shalter.ru)" };

interface Place {
  lat: number;
  lng: number;
  city: string;
}

async function getJson(url: string, timeoutMs = 7000): Promise<any> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function isPrivateIp(ip: string): boolean {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
}

/** Адреса для документации (TEST-NET-1/2/3, RFC 5737): в интернете их нет — страну не ищем. */
const isDocumentationIp = (ip: string) => /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip);

/** Адрес клиента без IPv4-in-IPv6 префикса. */
export const normalizeIp = (raw: string | undefined): string => String(raw || "").replace(/^::ffff:/, "");

const COUNTRY_TTL_MS = 6 * 3600_000;
const COUNTRY_FAIL_TTL_MS = 10 * 60_000;
const COUNTRY_CACHE_MAX = 10_000;
const COUNTRY_TIMEOUT_MS = 3000;

@Injectable()
export class GeoService {
  /** Страна по IP: адрес → { код страны или null, когда истекает }. */
  private readonly countries = new Map<string, { country: string | null; expires: number }>();
  private readonly pendingCountries = new Map<string, Promise<string | null>>();

  /**
   * Страна (ISO-код, "DE") по IP: ipwho.is, запасной — get.geojs.io. Частный адрес — null без
   * запроса (за прокси это значит, что адрес клиента неизвестен). Ответы кэшируются в памяти
   * (6 часов, неудача — 10 минут), одновременные запросы про один адрес идут одним запросом.
   */
  public countryByIp(rawIp: string | undefined): Promise<string | null> {
    const ip = normalizeIp(rawIp);
    if (isPrivateIp(ip) || isDocumentationIp(ip)) return Promise.resolve(null);
    const cached = this.countries.get(ip);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.country);
    const pending = this.pendingCountries.get(ip);
    if (pending) return pending;
    const lookup = this.lookupCountry(ip).then((country) => {
      this.pendingCountries.delete(ip);
      if (this.countries.size >= COUNTRY_CACHE_MAX) this.countries.delete(this.countries.keys().next().value!);
      this.countries.set(ip, { country, expires: Date.now() + (country ? COUNTRY_TTL_MS : COUNTRY_FAIL_TTL_MS) });
      return country;
    });
    this.pendingCountries.set(ip, lookup);
    return lookup;
  }

  private async lookupCountry(ip: string): Promise<string | null> {
    const path = encodeURIComponent(ip);
    const providers = [
      async () => {
        const d = await getJson(`https://ipwho.is/${path}?fields=success,country_code`, COUNTRY_TIMEOUT_MS);
        if (d.success === false) throw new Error("ipwho failed");
        return d.country_code;
      },
      async () => (await getJson(`https://get.geojs.io/v1/ip/country/${path}.json`, COUNTRY_TIMEOUT_MS)).country,
    ];
    for (const p of providers) {
      try {
        const code = String((await p()) ?? "").trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(code)) return code;
      } catch {}
    }
    return null;
  }

  /** Примерное место по IP: ipwho.is, запасной — get.geojs.io. Частный адрес — сервис определит сам. */
  public async byIp(rawIp: string | undefined): Promise<Place> {
    const ip = normalizeIp(rawIp);
    const path = isPrivateIp(ip) ? "" : `/${encodeURIComponent(ip)}`;
    const providers = [
      async (): Promise<Place> => {
        const d = await getJson(`https://ipwho.is${path || "/"}?lang=ru`);
        if (d.success === false) throw new Error(d.message || "ipwho failed");
        return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city || d.region || d.country || "" };
      },
      async (): Promise<Place> => {
        const d = await getJson(`https://get.geojs.io/v1/ip/geo${path}.json`);
        return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city || d.region || d.country || "" };
      },
    ];
    for (const p of providers) {
      try {
        const r = await p();
        if (Number.isFinite(r.lat) && Number.isFinite(r.lng) && (r.lat || r.lng)) return r;
      } catch {}
    }
    throw new ApiError(503, "Не удалось определить местоположение по сети");
  }

  public async search(raw: unknown) {
    const q = String(raw ?? "").trim().slice(0, 200);
    if (!q) return { places: [] };
    let list: unknown;
    try {
      list = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ru&q=${encodeURIComponent(q)}`);
    } catch {
      throw new ApiError(503, "Поиск адресов сейчас недоступен");
    }
    return {
      places: (Array.isArray(list) ? list : [])
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), name: p.display_name || "" }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    };
  }
}
