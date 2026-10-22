import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

// Координаты проверяет сервис (lib/nearby-distance.ts), как server/routes/nearby.js.
export const coordsSchema = requestBody({ lat: raw(), lng: raw() });
export type CoordsDto = z.infer<typeof coordsSchema>;
