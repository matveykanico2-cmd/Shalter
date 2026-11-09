import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DomNode } from "./dom-node";

let notify: IntersectionObserverCallback | null = null;

class ObserverStub {
  public constructor(callback: IntersectionObserverCallback) {
    notify = callback;
  }
  public observe() {}
  public disconnect() {}
}

describe("DomNode viewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    notify = null;
  });

  it("не создаёт тяжёлый узел до приближения к viewport", () => {
    vi.stubGlobal("IntersectionObserver", ObserverStub);
    const create = vi.fn(() => document.createElement("canvas"));
    const { container } = render(<DomNode viewport create={create} />);
    const host = container.firstElementChild!;

    expect(create).not.toHaveBeenCalled();
    act(() => notify?.([{ target: host, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.querySelector("canvas")).toBeTruthy();
    expect(host.hasAttribute("data-in-viewport")).toBe(true);
  });
});
