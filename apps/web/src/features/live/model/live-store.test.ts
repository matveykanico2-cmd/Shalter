import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { fakeApi, FakePeer, fakeRtc, FakeSocket, fakeSocket } from "@/shared/lib/test";

import { closeLive, getLive, leaveLive, openLive, toggleMic } from "./live-store";

const ME = "u_me0000000";
const HOST = "u_host00000";
const VIEWER = "u_viewer000";
const ID = "live_1700000000000_abc";
const at = "2026-10-26T10:00:00.000Z";
const stream = (patch: Record<string, unknown> = {}) => ({ id: ID, chatId: "c_1", hostId: HOST, title: "Разбор", withVideo: true, source: "webrtc", rtmpLive: false, status: "live", startedAt: at, endedAt: null, ...patch });
const person = (userId: string, role: string, name: string, patch: Record<string, unknown> = {}) => ({ userId, role, handRaised: false, mutedByHost: false, joinedAt: at, user: { id: userId, name }, ...patch });
const state = (participants: unknown[], patch: Record<string, unknown> = {}) => ({ body: { stream: stream(patch), participants, messages: [], ingest: null } });

/** Что ушло в сокет: сигналы WebRTC эфира. */
const sent = () =>
  FakeSocket.last()
    .sent.map((raw) => JSON.parse(raw) as { type: string; kind?: string; toUserId?: string; streamId?: string })
    .filter((m) => m.type === "live:signal:send");

beforeEach(() => {
  fakeSocket();
  ws.start();
  FakeSocket.last().open();
});

afterEach(async () => {
  await leaveLive();
  closeLive();
  ws.stop();
  vi.unstubAllGlobals();
});

describe("эфир", () => {
  it("зритель: без камеры; offer ведущего — answer; чат эфира; live:ended — эфир закрыт, экран остаётся", async () => {
    const { getUserMedia } = fakeRtc();
    fakeApi({ [`POST /api/live/${ID}/join`]: state([person(HOST, "host", "Лена"), person(ME, "viewer", "Аня")]), [`POST /api/live/${ID}/leave`]: { body: { ok: true } } });
    openLive(ID, ME, { chatTitle: "Клуб" });
    expect(getLive().screen).toMatchObject({ streamId: ID, joining: true });
    await vi.waitFor(() => expect(getLive().live?.myRole).toBe("viewer"));
    expect(getLive().screen?.joining).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
    // Зритель offer не шлёт — шлёт ведущий.
    expect(sent()).toEqual([]);

    FakeSocket.last().receive({ type: "live:signal", streamId: ID, fromUserId: HOST, kind: "offer", data: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(sent().find((m) => m.kind === "answer")).toMatchObject({ toUserId: HOST, streamId: ID }));
    // Принимает звук и видео, сам ничего не шлёт.
    expect(FakePeer.instances[0]!.transceivers.map((t) => t.direction)).toEqual(["recvonly", "recvonly"]);
    FakePeer.instances[0]!.remoteTrack("video");
    expect(Object.keys(getLive().live!.remoteStreams)).toEqual([HOST]);

    const message = { id: "lm_1700000000001_abc", text: "привет", createdAt: at, user: { id: HOST, name: "Лена" } };
    FakeSocket.last().receive({ type: "live:message", streamId: ID, message });
    FakeSocket.last().receive({ type: "live:message", streamId: "live_1_other", message: { ...message, id: "lm_2_x" } });
    expect(getLive().live?.messages).toEqual([message]);
    FakeSocket.last().receive({ type: "live:message-updated", streamId: ID, message: { ...message, text: "привет всем", editedAt: at } });
    expect(getLive().live?.messages[0]?.text).toBe("привет всем");
    FakeSocket.last().receive({ type: "live:message-deleted", streamId: ID, messageId: message.id });
    expect(getLive().live?.messages).toEqual([]);

    FakeSocket.last().receive({ type: "live:ended", chatId: "c_1", streamId: ID });
    expect(getLive().live).toBeNull();
    expect(getLive().screen?.streamId).toBe(ID);
    expect(FakePeer.instances[0]!.connectionState).toBe("closed");
  });

  it("offer ведущего пришёл раньше, чем вход закончился, — не теряется", async () => {
    fakeRtc();
    fakeApi({ [`POST /api/live/${ID}/join`]: state([person(HOST, "host", "Лена"), person(ME, "viewer", "Аня")]) });
    openLive(ID, ME);
    FakeSocket.last().receive({ type: "live:signal", streamId: ID, fromUserId: HOST, kind: "offer", data: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(sent().find((m) => m.kind === "answer")).toMatchObject({ toUserId: HOST }));
    expect(FakePeer.instances).toHaveLength(1);
  });

  it("ведущий: камера и микрофон, offer каждому; микрофон выключается", async () => {
    const { getUserMedia } = fakeRtc();
    fakeApi({ [`POST /api/live/${ID}/join`]: state([person(ME, "host", "Аня"), person(VIEWER, "viewer", "Олег")], { hostId: ME }), "GET /api/calls/ice-servers": { body: { iceServers: [{ urls: "stun:example.org" }] } } });
    openLive(ID, ME);
    await vi.waitFor(() => expect(sent().find((m) => m.kind === "offer")).toMatchObject({ toUserId: VIEWER }));
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: true, video: expect.any(Object) }));
    expect(FakePeer.instances[0]!.config.iceServers).toEqual([{ urls: "stun:example.org" }]);
    expect(getLive().live?.localStream?.getTracks().map((t) => t.kind)).toEqual(["audio", "video"]);
    toggleMic();
    expect(getLive().live?.micOn).toBe(false);
    expect(getLive().live?.localStream?.getAudioTracks()[0]?.enabled).toBe(false);
  });

  it("зрителю дали слово (live:state) — публикует, камера сначала выключена", async () => {
    const { getUserMedia } = fakeRtc();
    let role = "viewer";
    fakeApi({
      [`POST /api/live/${ID}/join`]: state([person(HOST, "host", "Лена"), person(ME, "viewer", "Аня")]),
      [`GET /api/live/${ID}`]: () => state([person(HOST, "host", "Лена"), person(ME, role, "Аня")]),
    });
    openLive(ID, ME);
    await vi.waitFor(() => expect(getLive().live?.myRole).toBe("viewer"));
    role = "speaker";
    FakeSocket.last().receive({ type: "live:state", streamId: ID });
    await vi.waitFor(() => expect(getLive().live?.myRole).toBe("speaker"));
    await vi.waitFor(() => expect(sent().find((m) => m.kind === "offer")).toMatchObject({ toUserId: HOST }));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getLive().live).toMatchObject({ camOn: false, canShare: true });
    expect(getLive().live?.localStream?.getVideoTracks()[0]?.enabled).toBe(false);
  });

  it("эфир из OBS: без WebRTC, поток с сервера; войти не вышло — ошибка на экране", async () => {
    const { getUserMedia } = fakeRtc();
    fakeApi({ [`POST /api/live/${ID}/join`]: state([person(HOST, "host", "Лена"), person(ME, "viewer", "Аня")], { source: "rtmp", rtmpLive: true }) });
    openLive(ID, ME);
    await vi.waitFor(() => expect(getLive().live?.flvUrl).toBe(`/api/live/${ID}/feed.flv`));
    expect(getUserMedia).not.toHaveBeenCalled();
    await leaveLive();

    fakeApi({ "POST /api/live/live_2_gone/join": { status: 404, body: { error: "Эфир не найден" } } });
    openLive("live_2_gone", ME);
    await vi.waitFor(() => expect(getLive().screen).toMatchObject({ joining: false, error: "Эфир не найден" }));
    expect(getLive().live).toBeNull();
  });
});
