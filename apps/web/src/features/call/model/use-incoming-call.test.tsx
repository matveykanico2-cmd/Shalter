import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { startRingtone, stopRingtone } from "@/shared/lib/media/sounds";
import { fakeApi, FakeSocket, fakeSocket } from "@/shared/lib/test";

import { useIncomingCall } from "./use-incoming-call";

vi.mock("@/shared/lib/media/sounds", () => ({ startRingtone: vi.fn(), stopRingtone: vi.fn() }));
const call = () => ({ id: "cl_1", kind: "audio", callerId: "u_other", status: "ongoing" as const, startedAt: new Date().toISOString(), participantIds: ["u_me", "u_other"] });
beforeEach(() => {
  vi.clearAllMocks();
  fakeSocket();
  ws.start();
  FakeSocket.last().open();
});
afterEach(() => { cleanup(); ws.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("ответ на другом устройстве глушит звонок; запоздавший incoming не включает его снова", async () => {
  const { calls } = fakeApi({ "GET /api/calls": { body: { calls: [] } } });
  const { result } = renderHook(() => useIncomingCall("u_me"));
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  act(() => FakeSocket.last().receive({ type: "call:incoming", call: call() }));
  expect(result.current.ringing?.id).toBe("cl_1");
  expect(startRingtone).toHaveBeenCalledTimes(1);
  act(() => FakeSocket.last().receive({ type: "call:answered", callId: "cl_1" }));
  expect(result.current.ringing).toBeNull();
  expect(stopRingtone).toHaveBeenCalledTimes(1);
  act(() => FakeSocket.last().receive({ type: "call:incoming", call: call() }));
  expect(result.current.ringing).toBeNull();
});

it("после перезагрузки ответивший аккаунт больше не звонит", async () => {
  fakeApi({ "GET /api/calls": { body: { calls: [{ ...call(), answered: true }] } } });
  const { result } = renderHook(() => useIncomingCall("u_me"));
  await act(async () => {});
  expect(result.current.ringing).toBeNull();
  expect(startRingtone).not.toHaveBeenCalled();
});

it("пропущенный WS-ответ подхватывается опросом даже при открытом сокете", async () => {
  vi.useFakeTimers();
  fakeApi({ "GET /api/calls": { body: { calls: [] } } });
  const { result } = renderHook(() => useIncomingCall("u_me"));
  await act(async () => {});
  act(() => FakeSocket.last().receive({ type: "call:incoming", call: call() }));
  expect(result.current.ringing).not.toBeNull();
  fakeApi({ "GET /api/calls": { body: { calls: [{ ...call(), answered: true }] } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current.ringing).toBeNull();
  expect(stopRingtone).toHaveBeenCalled();
});

it("открытие текущего звонка глушит рингтон даже без события answered", async () => {
  fakeApi({ "GET /api/calls": { body: { calls: [] } } });
  const { result, rerender } = renderHook(({ active }: { active?: string }) => useIncomingCall("u_me", active), { initialProps: {} });
  await act(async () => {});
  act(() => FakeSocket.last().receive({ type: "call:incoming", call: call() }));
  expect(result.current.ringing).not.toBeNull();
  rerender({ active: "cl_1" });
  expect(stopRingtone).toHaveBeenCalledTimes(1);
});
