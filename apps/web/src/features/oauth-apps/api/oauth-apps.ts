import type { appBody, appsBody, secretBody } from "@shalter/shared/schemas/oauth";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { http } from "@/shared/api";

export type OAuthApp = z.infer<typeof appsBody>["apps"][number];
export type OAuthSecret = z.infer<typeof secretBody>;

const id = encodeURIComponent;

export const oauthAppsQueries = {
  /** Свои приложения «Войти через Shalter» (GET /api/oauth/apps). */
  mine: () => queryOptions({ queryKey: ["oauth", "apps"], queryFn: async ({ signal }) => (await http.get<z.infer<typeof appsBody>>("/api/oauth/apps", signal)).apps }),
};

export const createOAuthApp = (name: string, redirectUri: string) => http.post<z.infer<typeof appBody>>("/api/oauth/apps", { name, redirectUri });
export const deleteOAuthApp = (appId: string) => http.delete(`/api/oauth/apps/${id(appId)}`);
export const regenerateOAuthApp = (appId: string) => http.post<z.infer<typeof appBody>>(`/api/oauth/apps/${id(appId)}/regenerate`);
export const oauthAppSecret = (appId: string) => http.get<OAuthSecret>(`/api/oauth/apps/${id(appId)}/secret`);
