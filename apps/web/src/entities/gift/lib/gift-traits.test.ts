// Картинка подарка строится лениво: пока подарок далеко от экрана, ни список сцен
// (/gift-scenes/index.json, 25 тыс. id), ни сцена, ни lottie не грузятся.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Observed = { el: Element; cb: IntersectionObserverCallback };

let observed: Observed[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

class FakeObserver {
  private readonly cb: IntersectionObserverCallback;
  public constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }
  public observe(el: Element) {
    observed.push({ el, cb: this.cb });
  }
  public unobserve(el: Element) {
    observed = observed.filter((o) => o.el !== el);
  }
  public disconnect() {}
}

/** Подарок «доехал» до экрана. */
function show(el: Element) {
  const hit = observed.find((o) => o.el === el);
  hit?.cb([{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function load() {
  vi.resetModules();
  return import("./gift-traits");
}

beforeEach(() => {
  observed = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/gift-scenes/index.json") return json(["shalter_crab_hug"]);
    if (url === "/gift-scenes/shalter_crab_hug.json") return json({ v: 1, loop: 2, bg: null, layers: [] });
    return json({ error: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderGiftArt", () => {
  it("вне экрана — рамка с эмодзи-заглушкой и ни одного запроса", async () => {
    const { renderGiftArt } = await load();
    const node = renderGiftArt({ id: "shalter_crab_hug", emoji: "🦀" }, { size: 72, replay: false }) as HTMLElement;
    expect(node.style.width).toBe("72px");
    expect(node.style.height).toBe("72px");
    expect(node.childNodes.length).toBe(1);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(observed.map((o) => o.el)).toEqual([node]);
  });

  it("у экрана — грузит список сцен и сцену подарка и рисует её", async () => {
    const { renderGiftArt } = await load();
    const node = renderGiftArt({ id: "shalter_crab_hug", emoji: "🦀" }, { size: 72, replay: false }) as HTMLElement;
    const placeholder = node.firstChild;
    show(node);
    await vi.waitFor(() => expect(node.firstChild).not.toBe(placeholder));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/gift-scenes/index.json", "/gift-scenes/shalter_crab_hug.json"]);
    expect(observed).toEqual([]);
  });

  it("список сцен один на все подарки; подарок без сцены свою сцену не спрашивает", async () => {
    const { renderGiftArt } = await load();
    const a = renderGiftArt({ id: "rose", emoji: "🌹" }, { size: 72, replay: false }) as HTMLElement;
    const b = renderGiftArt({ id: "nt_robot", emoji: "🤖" }, { size: 72, replay: false }) as HTMLElement;
    show(a);
    show(b);
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 0));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u === "/gift-scenes/index.json")).toHaveLength(1);
    expect(urls.some((u) => u.startsWith("/gift-scenes/") && u !== "/gift-scenes/index.json")).toBe(false);
  });

  it("картинка по ссылке — сразу, без списка сцен", async () => {
    const { renderGiftArt } = await load();
    const node = renderGiftArt({ id: "g_custom", emoji: "🎁", mediaUrl: "/uploads/gift_0123456789abcdef.gif", name: "Мой" }, { size: 96 });
    expect(node).toBeInstanceOf(HTMLImageElement);
    expect((node as HTMLImageElement).loading).toBe("lazy");
    expect(observed).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
