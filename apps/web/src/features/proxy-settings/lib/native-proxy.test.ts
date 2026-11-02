import { describe, expect, it } from "vitest";

import { nativeProxyUrl, parseNativeProxyUrl, validateNativeProxy } from "./native-proxy";

describe("native proxy", () => {
  it("строит адрес с логином и паролем и разбирает его обратно", () => {
    const p = { type: "socks5" as const, host: "10.0.0.5", port: 1080, username: "ivan", password: "p@ss:1/2" };
    const url = nativeProxyUrl(p);
    expect(url).toBe("socks5://ivan:p%40ss%3A1%2F2@10.0.0.5:1080");
    expect(parseNativeProxyUrl(url)).toEqual(p);
  });

  it("без логина — только хост и порт", () => {
    expect(nativeProxyUrl({ type: "http", host: "proxy.example.net", port: 3128, username: "", password: "" })).toBe("http://proxy.example.net:3128");
  });

  it("проверяет хост, порт и пароль без логина", () => {
    const ok = { type: "http" as const, host: "1.2.3.4", port: 8080, username: "", password: "" };
    expect(validateNativeProxy(ok)).toBeNull();
    expect(validateNativeProxy({ ...ok, host: "" })).toMatch(/IP/);
    expect(validateNativeProxy({ ...ok, port: 70000 })).toMatch(/Порт/);
    expect(validateNativeProxy({ ...ok, password: "x" })).toMatch(/логин/);
  });

  it("чужие схемы не принимает", () => {
    expect(parseNativeProxyUrl("https://a.b:1")).toBeNull();
    expect(parseNativeProxyUrl(null)).toBeNull();
  });
});
