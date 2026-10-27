// Фикстуры e2e: один сервер на воркер (своя временная база), пользователи
// создаются через API, а в браузер попадают через cookie — без прохода по форме входа.
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startServer, type TestServer, webBuild } from "../../support/server";
import { startEgress, type Egress } from "./egress";
import { registerUser, login, type TestUser } from "../../support/seed";
import type { Api } from "../../support/client";

export interface Session {
  context: BrowserContext;
  page: Page;
}

type WorkerFixtures = {
  /** Заглушка внешнего мира для сервера воркера: «сайт» PUBLIC_HOST:80, всё прочее — 502. */
  egress: Egress;
  server: TestServer;
};
type TestFixtures = {
  /** Внешние запросы браузера за тест (кроме KNOWN_EXTERNAL); в конце теста должно быть пусто. */
  externalRequests: Set<string>;
  baseUrl: string;
  /** Новый пользователь, зарегистрированный через API. */
  newUser: (name?: string) => Promise<TestUser>;
  /** Отдельный контекст браузера («устройство»), в который переложены cookie из Api. */
  openAs: (api: Api, path?: string, opts?: { userAgent?: string }) => Promise<Session>;
};

/** Cookie из Api → cookie браузерного контекста (Api хранит декодированные значения). */
export async function copyCookies(api: Api, context: BrowserContext) {
  const url = new URL(api.baseUrl);
  await context.addCookies(
    [...api.cookies].map(([name, value]) => ({
      name,
      value: encodeURIComponent(value),
      domain: url.hostname,
      path: "/",
    }))
  );
}

/**
 * Онбординг-окно «Разрешения» всплывает через ~1,5 с после первого входа и
 * перекрывает экран (а его появление закрывает открытые меню — источник флейков).
 * Сейчас его подавляет флаг в localStorage (деталь реализации, не предмет тестов);
 * если в новой реализации ключ другой — окно закроет обработчик ниже.
 */
export async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("shalter.permissionsAsked", "1");
    } catch {}
  });
  await page.addLocatorHandler(page.getByRole("heading", { name: "Разрешения" }), async () => {
    await page.getByRole("button", { name: "Готово" }).click();
  });
}

/**
 * Внешние адреса, которые приложение грузит намеренно (счётчик Яндекс.Метрики в
 * public/index.html): в тестах они просто обрываются, чтобы не слать визиты в
 * боевую статистику и не зависеть от сети.
 */
const KNOWN_EXTERNAL = new Set(["mc.yandex.ru"]);

const isLocalUrl = (url: URL) => url.hostname === "127.0.0.1" || url.hostname === "localhost";

/**
 * Браузер в тестах не ходит в интернет: всё, что не на локальный сервер, обрывается
 * как при отключённой сети и записывается в sink. Заглушки page.route в самих тестах
 * проверяются раньше и продолжают работать.
 */
export async function blockInternet(context: BrowserContext, sink: Set<string>) {
  await context.route(
    (url) => !isLocalUrl(url),
    (route) => {
      const url = new URL(route.request().url());
      if (!KNOWN_EXTERNAL.has(url.hostname)) sink.add(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort("internetdisconnected");
    },
  );
}

async function newSession(browser: Browser, baseUrl: string, api: Api | null, path: string, sink: Set<string>, userAgent?: string): Promise<Session> {
  const context = await browser.newContext({ baseURL: baseUrl, ...(userAgent ? { userAgent } : {}) });
  await blockInternet(context, sink);
  if (api) await copyCookies(api, context);
  const page = await context.newPage();
  await dismissOnboarding(page);
  await page.goto(path);
  return { context, page };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  egress: [
    async ({}, use) => {
      const egress = await startEgress();
      try {
        await use(egress);
      } finally {
        await egress.stop();
      }
    },
    { scope: "worker" },
  ],
  server: [
    async ({ egress }, use) => {
      const server = await startServer({ env: egress.env, webDist: webBuild() });
      try {
        await use(server);
      } finally {
        await server.stop();
      }
    },
    { scope: "worker", timeout: 40_000 },
  ],
  externalRequests: [
    async ({}, use) => {
      const sink = new Set<string>();
      await use(sink);
      expect([...sink], "браузер ходил в интернет — заглушите адрес через page.route").toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, externalRequests }, use) => {
    await blockInternet(context, externalRequests);
    await use(context);
  },
  baseUrl: async ({ server }, use) => use(server.baseUrl),
  page: async ({ page }, use) => {
    await dismissOnboarding(page);
    await use(page);
  },
  baseURL: async ({ server }, use) => use(server.baseUrl),
  newUser: async ({ server }, use) => {
    let i = 0;
    await use(async (name) => registerUser(server.baseUrl, { name: name ?? `Тест ${++i}` }));
  },
  openAs: async ({ browser, server, externalRequests }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (api, path = "/", opts = {}) => {
      const s = await newSession(browser, server.baseUrl, api, path, externalRequests, opts.userAgent);
      contexts.push(s.context);
      return s;
    });
    for (const c of contexts) await c.close().catch(() => {});
  },
});

export { expect, login };
export type { TestUser };
