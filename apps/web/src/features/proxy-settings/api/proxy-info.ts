import { queryOptions } from "@tanstack/react-query";

// Открыта ли страница через прокси: GET /api/proxy-info отвечает сам прокси (apps/proxy),
// у сервера Shalter такого пути нет — 404, значит, подключение прямое.
export type ProxyInfo = { proxy: true; link: string; upstream: string; private: boolean };

async function fetchProxyInfo(): Promise<ProxyInfo | null> {
  try {
    const res = await fetch("/api/proxy-info", { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<ProxyInfo> | null;
    return body?.proxy === true && typeof body.link === "string" ? (body as ProxyInfo) : null;
  } catch {
    return null;
  }
}

export const proxyQueries = {
  baseKey: ["proxy"] as const,
  info: () => queryOptions({ queryKey: [...proxyQueries.baseKey, "info"], queryFn: fetchProxyInfo, staleTime: Infinity }),
};
