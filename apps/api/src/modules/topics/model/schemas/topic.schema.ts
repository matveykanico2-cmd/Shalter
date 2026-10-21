import { z } from "zod";
import { raw, requestBody } from "../../../../common/lib/zod.js";

export const topicsEnabledSchema = requestBody({ enabled: raw() });
export type TopicsEnabledDto = z.infer<typeof topicsEnabledSchema>;

export const createTopicSchema = requestBody({ title: raw(), icon: raw(), color: raw() });
export type CreateTopicDto = z.infer<typeof createTopicSchema>;

export const patchTopicSchema = requestBody({ title: raw(), icon: raw(), color: raw(), closed: raw() });
export type PatchTopicDto = z.infer<typeof patchTopicSchema>;
