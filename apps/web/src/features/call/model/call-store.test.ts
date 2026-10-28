import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { fakeApi, FakePeer, fakeRtc, FakeSocket, fakeSocket } from "@/shared/lib/test";

import { getCall, hangup, joinCallById, joinVoiceRoom, placeCall, toggleMute } from "./call-store";

const ME = { id: "u_me0000000", name: "Аня" };
const BORIS = { id: "u_boris0000", name: "Борис", avatarColor: "#123456" };
const CALL = { id: "cl_1", chatId: "c_1", kind: "audio", callerId: ME.id, status: "ongoing", startedAt: "2026-10-26T10:00:00.000Z", durationSec: 0, participantIds: [ME.id, BORIS.id] };
const chatRoute = { body: { chat: { id: "c_1", type: "dm", title: null }, members: [ME, BORIS] } };

/** Что ушло в сокет: сигналы WebRTC. */
const sentSignals = () =>
  FakeSocket.last()
    .sent.map((raw) => JSON.parse(raw) as { type: string; kind?: string; toUserId?: string; data?: unknown })
    .filter((m) => m.type === "call:signal:send");

const signal = (kind: string, data: unknown, seq: number) => ({ id: `sig_1_${seq}`, seq, callId: "cl_1", fromUserId: BORIS.id, toUserId: ME.id, kind, data, createdAt: "2026-10-26T10:00:01.000Z" });

beforeEach(() => {
  fakeSocket();
  fakeRtc();
  ws.start();
  FakeSocket.last().open();
});

afterEach(async () => {
  await hangup();
  ws.stop();
  vi.unstubAllGlobals();
});

describe("звонок", () => {
  it("исходящий: звонок, offer собеседнику по сокету, ответ — разговор, сброс — «завершён» с длительностью", async () => {
    const { calls } = fakeApi({
      "POST /api/calls": { body: { call: CALL } },
      "GET /api/chats/c_1": chatRoute,
      "GET /api/calls/ice-servers": { body: { iceServers: [{ urls: "stun:example.org" }] } },
      "PATCH /api/calls/cl_1": { body: { call: { ...CALL, status: "completed" } } },
    });
    expect(await placeCall("c_1", "audio", ME)).toBe("cl_1");
    expect(calls.find((c) => c.key === "POST /api/calls")?.body).toEqual({ chatId: "c_1", kind: "audio", ringAll: false });
    // У лички нет названия — звонок подписан именем собеседника.
    expect(getCall()).toMatchObject({ chatTitle: "Борис", phase: "ringing", others: [BORIS] });
    expect(FakePeer.instances[0]!.config.iceServers).toEqual([{ urls: "stun:example.org" }]);
    const offer = sentSignals().find((m) => m.kind === "offer");
    expect(offer).toMatchObject({ toUserId: BORIS.id });
    // Opus с защитой от потерь.
    expect((offer!.data as { sdp: string }).sdp).toContain("useinbandfec=1");

    FakeSocket.last().receive({ type: "call:signal", signal: signal("answer", { type: "answer", sdp: "v=0" }, 1) });
    await vi.waitFor(() => expect(FakePeer.instances[0]!.currentRemoteDescription).toMatchObject({ type: "answer" }));
    FakePeer.instances[0]!.connect();
    expect(getCall()?.phase).toBe("connected");

    toggleMute();
    expect(getCall()?.muted).toBe(true);
    expect(getCall()?.localStream?.getAudioTracks()[0]?.enabled).toBe(false);

    expect(await hangup()).toBe("c_1");
    expect(calls.find((c) => c.key === "PATCH /api/calls/cl_1")?.body).toEqual({ status: "completed", durationSec: 0 });
    expect(sentSignals().some((m) => m.kind === "end")).toBe(true);
    expect(getCall()).toBeNull();
  });

  it("видеозвонок: камера с подсказкой motion, после согласования — потолок 2,5 Мбит/с, 30 кадров, balanced", async () => {
    fakeApi({ "POST /api/calls": { body: { call: { ...CALL, kind: "video" } } }, "GET /api/chats/c_1": chatRoute, "PATCH /api/calls/cl_1": { body: { call: CALL } } });
    const { getUserMedia } = fakeRtc();
    await placeCall("c_1", "video", ME);
    // 720p/30 с фронтальной камеры, моно-микрофон с эхо- и шумоподавлением.
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" },
    });
    const peer = FakePeer.instances[0]!;
    const cam = peer.transceivers.find((t) => t.sender.track?.kind === "video")!.sender;
    expect((cam.track as unknown as { contentHint?: string }).contentHint).toBe("motion");
    // Дорожка камеры пришла через addTrack (не replaceTrack) — её тоже настраивают.
    await vi.waitFor(() => expect(cam.params).toMatchObject({ encodings: [{ maxBitrate: 3_500_000, maxFramerate: 30 }], degradationPreference: "balanced" }));
    // Голос: моно, FEC, без DTX.
    const offer = sentSignals().find((m) => m.kind === "offer")!.data as { sdp: string };
    expect(offer.sdp).toContain("stereo=0");
    expect(offer.sdp).not.toContain("usedtx=1");
  });

  it("медленная сеть: перезапуск ICE не раньше 20 с, ошибка — ещё через 10 с; соединились — ошибки нет", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fakeApi({ "POST /api/calls": { body: { call: CALL } }, "GET /api/chats/c_1": chatRoute, "PATCH /api/calls/cl_1": { body: { call: CALL } } });
      await placeCall("c_1", "audio", ME);
      const peer = FakePeer.instances[0]!;
      const restartIce = vi.spyOn(peer, "restartIce");
      FakeSocket.last().receive({ type: "call:signal", signal: signal("answer", { type: "answer", sdp: "v=0" }, 1) });
      await vi.waitFor(() => expect(peer.currentRemoteDescription).toMatchObject({ type: "answer" }));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(restartIce).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(restartIce).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(8_000);
      expect(getCall()?.connectionError).toBeNull();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(getCall()?.connectionError).toMatch(/Не удалось установить соединение/);
      // ICE всё-таки сошёлся — ошибка уходит, разговор идёт.
      peer.connect();
      expect(getCall()).toMatchObject({ connectionError: null, phase: "connected" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("не дождались ответа — сброс отмечает звонок «без ответа»", async () => {
    const { calls } = fakeApi({
      "POST /api/calls": { body: { call: CALL } },
      "GET /api/chats/c_1": chatRoute,
      "PATCH /api/calls/cl_1": { body: { call: CALL } },
    });
    await placeCall("c_1", "audio", ME);
    await hangup();
    expect(calls.find((c) => c.key === "PATCH /api/calls/cl_1")?.body).toEqual({ status: "missed", durationSec: 0 });
  });

  it("входящий: ответ, answer на offer звонящего; тот же сигнал из опроса второй раз не применяется", async () => {
    const incoming = { ...CALL, callerId: BORIS.id };
    const { calls } = fakeApi({
      "GET /api/calls": { body: { calls: [{ ...incoming, direction: "incoming", otherUser: BORIS, group: null }] } },
      "GET /api/chats/c_1": chatRoute,
      "GET /api/calls/cl_1/signal?after=0": { body: { signals: [signal("offer", { type: "offer", sdp: "v=0" }, 1)] } },
    });
    await joinCallById("cl_1", ME);
    // Ответ на входящий — только по кнопке «Ответить» (IncomingCall.answer), не при входе.
    expect(calls.some((c) => c.key === "POST /api/calls/cl_1/answer")).toBe(false);
    // Без offer от отвечающего: offer шлёт звонящий.
    expect(sentSignals().some((m) => m.kind === "offer")).toBe(false);

    FakeSocket.last().receive({ type: "call:signal", signal: signal("offer", { type: "offer", sdp: "v=0" }, 1) });
    await vi.waitFor(() => expect(sentSignals().find((m) => m.kind === "answer")).toMatchObject({ toUserId: BORIS.id }));
    // Опрос раз в 3 с приносит тот же offer.
    await vi.waitFor(() => expect(calls.some((c) => c.key === "GET /api/calls/cl_1/signal?after=0")).toBe(true), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(FakePeer.instances).toHaveLength(1);
    expect(FakePeer.instances[0]!.createAnswer).toHaveBeenCalledTimes(1);
  });

  it("собеседник положил трубку (call:updated) — «Звонок завершён», затем звонка нет", async () => {
    fakeApi({ "POST /api/calls": { body: { call: CALL } }, "GET /api/chats/c_1": chatRoute });
    await placeCall("c_1", "audio", ME);
    FakeSocket.last().receive({ type: "call:updated", call: { ...CALL, status: "completed" } });
    expect(getCall()?.phase).toBe("ended");
    await vi.waitFor(() => expect(getCall()).toBeNull());
  });

  it("нет доступа к микрофону — звонок идёт, с пояснением", async () => {
    fakeApi({ "POST /api/calls": { body: { call: CALL } }, "GET /api/chats/c_1": chatRoute });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error("NotAllowedError"));
    await placeCall("c_1", "audio", ME);
    expect(getCall()?.mediaError).toBe("Нет доступа к микрофону или камере — звук и видео от вас не передаются");
  });

  it("голосовой чат группы: последний собеседник ушёл — остаёмся ждать; выход — leave комнаты", async () => {
    const room = { ...CALL, id: "cl_1", kind: "voice-room", callerId: BORIS.id, participantIds: [BORIS.id, ME.id] };
    const { calls } = fakeApi({
      "POST /api/calls/room/c_1/join": { body: { call: room } },
      "GET /api/chats/c_1": { body: { chat: { id: "c_1", type: "group", title: "Семья" }, members: [ME, BORIS] } },
      "POST /api/calls/room/c_1/leave": { body: { ok: true } },
    });
    expect(await joinVoiceRoom("c_1", ME)).toBe("cl_1");
    expect(getCall()).toMatchObject({ isRoom: true, chatTitle: "Семья", others: [BORIS] });
    FakeSocket.last().receive({ type: "call:signal", signal: signal("end", null, 1) });
    await vi.waitFor(() => expect(getCall()?.others).toEqual([]));
    expect(getCall()?.phase).not.toBe("ended");
    await hangup();
    expect(calls.some((c) => c.key === "POST /api/calls/room/c_1/leave")).toBe(true);
  });
});
