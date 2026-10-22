import type { message } from "@shalter/shared/schemas/message";
import type { z } from "zod";

export type Message = z.infer<typeof message>;
