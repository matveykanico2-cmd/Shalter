// «Люди рядом»: server/routes/nearby.js, строки — server/data/nearby.js
// listNearbyUsers (сырые колонки users, без publicUser и без координат).
import { z } from "zod";

export const nearbyLabel = z.enum(["менее 1 км", "1–3 км", "3–10 км", "10–30 км", "более 30 км"]);

export const nearbyUser = z.strictObject({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  avatarColor: z.string().nullable(),
  avatarImage: z.string().nullable(),
  label: nearbyLabel,
});

export const nearbyBody = z.strictObject({ users: z.array(nearbyUser) });
