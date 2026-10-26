import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import { settingsQueries } from "@/entities/settings";

import { ws } from "@/shared/api";
import { FakeSocket, fakeSocket } from "@/shared/lib/test";

import { useMessageSounds } from "./use-message-sounds";

let oscillators = 0;
class FakeAudioContext {
  public state = "running";
  public currentTime = 0;
  public destination = {};
  public resume = () => Promise.resolve();
  public createOscillator() {
    oscillators += 1;
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
    return { type: "sine", frequency: param, connect: (n: unknown) => n, start() {}, stop() {} };
  }
  public createGain() {
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
    return { gain: param, connect: (n: unknown) => n };
  }
}

const ME = "u_me0000000";
const chat = (id: string, patch: Partial<ChatSummary> = {}) => ({ id, muted: false, mutedUntil: null, ...patch }) as ChatSummary;
const incoming = (chatId: string, senderId = "u_lena00000", extra = {}) => ({
  type: "message:new",
  chatId,
  message: { id: `m_${Math.random()}`, chatId, senderId, type: "text", text: "hi", createdAt: new Date().toISOString() },
  ...extra,
});

beforeEach(() => {
  oscillators = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  fakeSocket();
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("звук входящего", () => {
  it("чужое в обычном чате — звук; своё, тихое, в чате без звука и при выключенном звуке — нет", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    client.setQueryData(chatQueries.list().queryKey, [chat("c_1"), chat("c_muted", { muted: true })]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useMessageSounds(ME), { wrapper });
    ws.start();
    act(() => FakeSocket.last().open());
    const receive = (e: object) => act(() => FakeSocket.last().receive(e));

    receive(incoming("c_1"));
    expect(oscillators).toBeGreaterThan(0);
    const after = oscillators;
    vi.advanceTimersByTime(1300);
    receive(incoming("c_1", ME));
    receive(incoming("c_1", "u_lena00000", { silent: true }));
    receive(incoming("c_muted"));
    expect(oscillators).toBe(after);
    client.setQueryData(settingsQueries.current().queryKey, { notifications: { sound: false } } as never);
    receive(incoming("c_1"));
    expect(oscillators).toBe(after);
  });
});
