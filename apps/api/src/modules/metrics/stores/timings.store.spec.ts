import { describe, expect, it } from "vitest";
import { TimingsStore } from "./timings.store.js";

describe("TimingsStore", () => {
  it("сводка по процентилям и сброс", () => {
    const store = new TimingsStore();
    for (let ms = 1; ms <= 100; ms++) store.add({ name: "app-ready", ms });
    store.add({ name: "chat-open", ms: 300 });
    expect(store.drain()).toEqual([
      { name: "app-ready", count: 100, p50: 51, p90: 91, p99: 100 },
      { name: "chat-open", count: 1, p50: 300, p90: 300, p99: 300 },
    ]);
    expect(store.drain()).toEqual([]);
  });
});
