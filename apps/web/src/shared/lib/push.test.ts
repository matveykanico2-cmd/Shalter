import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "./test";

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { Capacitor?: unknown }).Capacitor;
  vi.resetModules();
});

describe("push в Android-приложении (Firebase)", () => {
  it("при запуске: каналы, разрешение, токен устройства уходит на сервер; нажатие на уведомление открывает чат", async () => {
    const listeners: Record<string, (data: unknown) => void> = {};
    const plugin = {
      checkPermissions: vi.fn().mockResolvedValue({ receive: "prompt" }),
      requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
      createChannel: vi.fn().mockResolvedValue(undefined),
      addListener: vi.fn(async (event: string, cb: (data: unknown) => void) => void (listeners[event] = cb)),
      register: vi.fn(async () => listeners.registration?.({ value: "tok123" })),
    };
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
    const open = vi.fn();
    (window as { __shalterOpen?: unknown }).__shalterOpen = open;
    const { calls } = fakeApi({ "POST /api/push/subscribe-native": { body: { ok: true } } });

    const { ensurePushSubscribed } = await import("./push");
    await ensurePushSubscribed();

    expect(plugin.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "calls" }));
    expect(plugin.requestPermissions).toHaveBeenCalled();
    expect(plugin.register).toHaveBeenCalled();
    await vi.waitFor(() => expect(calls.find((c) => c.key === "POST /api/push/subscribe-native")?.body).toEqual({ token: "tok123", callUi: false }));

    listeners.pushNotificationActionPerformed?.({ notification: { data: { url: "/chat/c_1" } } });
    expect(open).toHaveBeenCalledWith("/chat/c_1");
  });
});
