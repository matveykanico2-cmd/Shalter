// Запасная геолокация: server/routes/geo.js (место по IP и поиск адреса через OSM).
import { z } from "zod";

export const geoIpBody = z.strictObject({ lat: z.number(), lng: z.number(), city: z.string() });
export const geoPlace = z.strictObject({ lat: z.number(), lng: z.number(), name: z.string() });
export const geoSearchBody = z.strictObject({ places: z.array(geoPlace) });

/** Язык интерфейса для клиента (GET /api/geo/language, без входа): по стране IP, Accept-Language или русский. */
export const geoLanguageBody = z.strictObject({
  language: z.string().min(2),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
  source: z.enum(["ip", "accept-language", "default"]),
});
