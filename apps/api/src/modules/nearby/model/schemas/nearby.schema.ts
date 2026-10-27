import { z } from "zod";
import { requestBody, requestQuery } from "../../../../common/lib/zod.js";
import { coord, validCoords } from "../../lib/nearby-distance.js";

// Как server/routes/nearby.js: одна ошибка на обе координаты, и до любого обращения к базе.
const coords = { lat: z.unknown().optional().transform(coord), lng: z.unknown().optional().transform(coord) };
const checkCoords = (c: { lat: number; lng: number }) => validCoords(c.lat, c.lng);

export const coordsSchema = requestBody(coords).refine(checkCoords, { error: "invalid coordinates" });
export type CoordsDto = z.infer<typeof coordsSchema>;

/** GET /api/nearby?lat=…&lng=… — те же правила, что у тела POST. */
export const coordsQuerySchema = requestQuery(coords).refine(checkCoords, { error: "invalid coordinates" });
export type CoordsQuery = z.infer<typeof coordsQuerySchema>;
