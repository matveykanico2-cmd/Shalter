import { vi } from "vitest";

type Reply = { status?: number; body: unknown };
type Route = (body: Record<string, unknown>) => Reply;

/** Подмена fetch: «METHOD /path» → ответ; запросы записываются для проверок. */
export function fakeApi(routes: Record<string, Route | Reply>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const route = routes[key];
    if (!route) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const reply = typeof route === "function" ? route(body) : route;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}
