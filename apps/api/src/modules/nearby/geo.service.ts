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

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isPrivateIp(ip: string): boolean {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
}

@Injectable()
export class GeoService {
  /** Примерное место по IP: ipwho.is, запасной — get.geojs.io. Частный адрес — сервис определит сам. */
  public async byIp(rawIp: string | undefined): Promise<Place> {
    const ip = String(rawIp || "").replace(/^::ffff:/, "");
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
