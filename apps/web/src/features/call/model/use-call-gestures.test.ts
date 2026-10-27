import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeStream, FakeTrack } from "@/shared/lib/test";

import type { HandsResults } from "../lib/mediapipe-hands";

import { useCallGestures } from "./use-call-gestures";

const fake = vi.hoisted(() => ({ send: vi.fn(async () => {}), close: vi.fn(async () => {}), onResults: null as null | ((r: HandsResults) => void) }));
vi.mock("../lib/mediapipe-hands", () => ({
  createHands: async () => ({
    setOptions() {},
    onResults: (cb: (r: HandsResults) => void) => void (fake.onResults = cb),
    send: fake.send,
    close: fake.close,
  }),
}));

// Рука с поднятым большим пальцем (остальные согнуты).
const thumbsUp = Array.from({ length: 21 }, (_, i) => ({ x: i === 4 ? 0.2 : 0.5, y: [8, 12, 16, 20].includes(i) ? 0.8 : 0.5 }));
const stream = () => new FakeStream([new FakeTrack("video")]) as unknown as MediaStream;

let ready = 0;
beforeEach(() => {
  vi.useFakeTimers();
  ready = 0;
  fake.send.mockClear();
  fake.close.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockImplementation(() => ready);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("распознавание жестов в звонке", () => {
  it("выключено — ничего не грузится", async () => {
    renderHook(() => useCallGestures(stream(), false));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("видео не готово — ждём без холостого цикла; готово — ~10 кадров в секунду; жест на экране 2,8 с", async () => {
    const { result, unmount } = renderHook(() => useCallGestures(stream(), true));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fake.send).not.toHaveBeenCalled();
    ready = 4;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fake.send.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(fake.send.mock.calls.length).toBeLessThanOrEqual(11);

    act(() => fake.onResults!({ multiHandLandmarks: [thumbsUp] }));
    expect(result.current.shown?.gesture).toBe("thumbs_up");
    await act(() => vi.advanceTimersByTimeAsync(2900));
    expect(result.current.shown).toBeNull();

    unmount();
    const sent = fake.send.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fake.send.mock.calls.length).toBe(sent);
    expect(fake.close).toHaveBeenCalled();
  });
});
