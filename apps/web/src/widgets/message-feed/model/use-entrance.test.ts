import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedMessage } from "@/entities/message";

import { useEntrance } from "./use-entrance";

const ME = "u_me";
const msg = (id: string, at: string, patch: Partial<FeedMessage> = {}) => ({ id, senderId: "u_lena", createdAt: `2026-10-27T10:${at}.000Z`, ...patch }) as FeedMessage;

describe("въезд новых сообщений", () => {
  it("история при открытии и подгруженные старые не въезжают, пришедшее после — один раз", () => {
    const history = [msg("m1", "00:00"), msg("m2", "01:00")];
    const { result, rerender } = renderHook(({ list }) => useEntrance("c_1", list, ME), { initialProps: { list: history } });
    expect(history.some(result.current.entering)).toBe(false);

    const fresh = msg("m3", "02:00");
    const older = msg("m0", "00:00", { createdAt: "2026-10-26T09:00:00.000Z" });
    rerender({ list: [older, ...history, fresh] });
    expect(result.current.entering(older)).toBe(false);
    expect(result.current.entering(fresh)).toBe(true);

    // Доиграло — при новом монтировании строки (прокрутка) больше не въезжает.
    act(() => result.current.finish("m3"));
    expect(result.current.entering(fresh)).toBe(false);
  });

  it("своё — только временным пузырём: подтверждённое сервером второй раз не въезжает", () => {
    const { result, rerender } = renderHook(({ list }) => useEntrance("c_1", list, ME), { initialProps: { list: [msg("m1", "00:00")] } });
    const pending = msg("local_1", "05:00", { senderId: ME, pending: true });
    const confirmed = msg("m2", "05:00", { senderId: ME });
    rerender({ list: [msg("m1", "00:00"), pending] });
    expect(result.current.entering(pending)).toBe(true);
    rerender({ list: [msg("m1", "00:00"), confirmed] });
    expect(result.current.entering(confirmed)).toBe(false);
  });

  it("пока истории нет, ничего не въезжает; пустой чат — въезжает первое же сообщение", () => {
    const first = msg("m1", "00:00");
    const { result, rerender } = renderHook(({ list }: { list: FeedMessage[] | undefined }) => useEntrance("c_1", list, ME), { initialProps: { list: undefined as FeedMessage[] | undefined } });
    expect(result.current.entering(first)).toBe(false);
    rerender({ list: [] });
    rerender({ list: [first] });
    expect(result.current.entering(first)).toBe(true);
  });
});
