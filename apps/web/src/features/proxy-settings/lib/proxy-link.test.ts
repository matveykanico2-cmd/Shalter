import { describe, expect, it } from "vitest";

import { parseProxyLink, proxyDeepLink } from "./proxy-link";

describe("ссылка прокси", () => {
  it("ссылка с секретом, адрес без схемы, ссылка для приложения", () => {
    expect(parseProxyLink(" https://proxy.example.net/some/page?proxy=abcDEF12_-&x=1 ")).toEqual({
      link: "https://proxy.example.net/?proxy=abcDEF12_-",
      origin: "https://proxy.example.net",
      host: "proxy.example.net",
      secret: "abcDEF12_-",
    });
    expect(parseProxyLink("1.2.3.4:8080")?.link).toBe("https://1.2.3.4:8080/");
    expect(parseProxyLink("http://1.2.3.4/")?.secret).toBeNull();
    const deep = proxyDeepLink("https://p.example/?proxy=abcdefgh12");
    expect(deep).toBe("shalter://settings/proxy?url=https%3A%2F%2Fp.example%2F%3Fproxy%3Dabcdefgh12");
    expect(parseProxyLink(deep)?.link).toBe("https://p.example/?proxy=abcdefgh12");
    expect(parseProxyLink("https://shalter.ru/settings/proxy?url=https%3A%2F%2Fp.example%2F")?.link).toBe("https://p.example/");
  });

  it("не ссылка — null", () => {
    expect(parseProxyLink("")).toBeNull();
    expect(parseProxyLink("javascript:alert(1)")).toBeNull();
    expect(parseProxyLink("https://p.example/?proxy=short")).toBeNull();
    expect(parseProxyLink("https://user:pw@p.example/")).toBeNull();
    expect(parseProxyLink("не ссылка вовсе")).toBeNull();
  });
});
