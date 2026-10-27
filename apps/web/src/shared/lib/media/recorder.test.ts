import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { firstFrame } from "./recorder";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("firstFrame", () => {
  it("кадр пришёл — true", async () => {
    let onFrame = () => {};
    const video = { requestVideoFrameCallback: (cb: () => void) => (onFrame = cb) } as unknown as HTMLVideoElement;
    const result = firstFrame(video);
    onFrame();
    await expect(result).resolves.toBe(true);
  });

  it("за 1,5 с кадра нет — false", async () => {
    const video = { requestVideoFrameCallback: () => 0 } as unknown as HTMLVideoElement;
    const result = firstFrame(video);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe(false);
  });
});
