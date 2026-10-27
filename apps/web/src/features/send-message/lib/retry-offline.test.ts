import { afterEach, describe, expect, it, vi } from "vitest";

import { retryOffline } from "./retry-offline";

afterEach(() => vi.useRealTimers());

describe("retryOffline", () => {
  it("повторяет при обрыве сети, пока не уйдёт", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue("ok");
    const result = retryOffline(send);
    await vi.advanceTimersByTimeAsync(1500);
    expect(send).toHaveBeenCalledTimes(2);
    // Сеть появилась — повтор сразу, не дожидаясь паузы.
    window.dispatchEvent(new Event("online"));
    await expect(result).resolves.toBe("ok");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("ошибку сервера не повторяет", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Нельзя"));
    await expect(retryOffline(send)).rejects.toThrow("Нельзя");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("через 2 минуты сдаётся", async () => {
    let t = 0;
    const send = vi.fn(() => {
      t += 121_000;
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    await expect(retryOffline(send, () => t)).rejects.toBeInstanceOf(TypeError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
