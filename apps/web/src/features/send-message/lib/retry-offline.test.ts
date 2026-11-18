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

  it.each([408, 425, 429, 500, 502, 503])("повторяет временный HTTP-ответ %s", async (status) => {
    vi.useFakeTimers();
    const transient = Object.assign(new Error(`HTTP ${status}`), { status });
    const send = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue("ok");
    const result = retryOffline(send);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe("ok");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("не превращает окончательную ошибку доступа в бесконечный retry", async () => {
    const forbidden = Object.assign(new Error("Нет доступа"), { status: 403 });
    const send = vi.fn().mockRejectedValue(forbidden);
    await expect(retryOffline(send)).rejects.toBe(forbidden);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("не сдаётся через две минуты плохой мобильной сети", async () => {
    vi.useFakeTimers();
    let t = 0;
    const send = vi.fn().mockImplementationOnce(() => {
      t += 121_000;
      return Promise.reject(new TypeError("Failed to fetch"));
    }).mockResolvedValue("ok");
    const result = retryOffline(send, () => t);
    await vi.advanceTimersByTimeAsync(1500);
    expect(send).toHaveBeenCalledTimes(2);
    await expect(result).resolves.toBe("ok");
  });
});
