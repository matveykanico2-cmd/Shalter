import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserMediaSafe, isMobileUa, mediaQuality, tuneOpusSdp, tuneVideoSender } from "./media-quality";

const err = (name: string) => Object.assign(new Error(name), { name });

function stubGum(...results: (Error | "ok")[]) {
  const stream = { id: "s" } as unknown as MediaStream;
  const getUserMedia = vi.fn(async () => {
    const r = results.shift() ?? "ok";
    if (r === "ok") return stream;
    throw r;
  });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return { getUserMedia, stream };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("качество звонков", () => {
  it("телефон узнаём по user agent", () => {
    expect(isMobileUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isMobileUa("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true);
    expect(isMobileUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
  });

  it("на ПК 1080p/60, 3,5 Мбит/с и стерео 128 кбит/с; на телефоне 720p/30, 1,5 Мбит/с и моно 64 кбит/с", () => {
    const pc = mediaQuality(false);
    expect(pc.video).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } });
    expect(pc.audio.channelCount).toBe(2);
    expect(pc).toMatchObject({ videoBitrate: 3_500_000, videoFramerate: 60, opusBitrate: 128_000, stereo: true });
    const phone = mediaQuality(true);
    expect(phone.video).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });
    expect(phone.audio.channelCount).toBe(1);
    expect(phone).toMatchObject({ videoBitrate: 1_500_000, videoFramerate: 30, opusBitrate: 64_000, stereo: false });
  });

  it("Opus: битрейт и стерео по устройству, чужие параметры fmtp сохраняются", () => {
    const sdp = "v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;stereo=0\r\n";
    expect(tuneOpusSdp({ type: "offer", sdp }, mediaQuality(false)).sdp).toContain(
      "a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=128000;stereo=1;sprop-stereo=1"
    );
    expect(tuneOpusSdp({ type: "offer", sdp }, mediaQuality(true)).sdp).toContain("maxaveragebitrate=64000;stereo=0;sprop-stereo=0");
  });

  it("видео: битрейт и кадры по устройству, экран — 4 Мбит/с и 30 кадров", async () => {
    const make = () => {
      const params = { encodings: [{}] } as RTCRtpSendParameters;
      return { params, sender: { track: { kind: "video" }, getParameters: () => params, setParameters: vi.fn(async () => {}) } as unknown as RTCRtpSender };
    };
    const pc = make();
    await tuneVideoSender(pc.sender, { quality: mediaQuality(false) });
    expect(pc.params.encodings[0]).toEqual({ maxBitrate: 3_500_000, maxFramerate: 60 });
    const phone = make();
    await tuneVideoSender(phone.sender, { quality: mediaQuality(true) });
    expect(phone.params.encodings[0]).toEqual({ maxBitrate: 1_500_000, maxFramerate: 30 });
    const screen = make();
    await tuneVideoSender(screen.sender, { screen: true, quality: mediaQuality(false) });
    expect(screen.params.encodings[0]).toEqual({ maxBitrate: 4_000_000, maxFramerate: 30 });
  });
});

describe("getUserMediaSafe", () => {
  const hd = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 }, facingMode: "user" };

  it("камера дала то, что просили, — один запрос", async () => {
    const { getUserMedia, stream } = stubGum("ok");
    expect(await getUserMediaSafe({ audio: true, video: hd })).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("1080p/60 не дали — просим 720p/30, затем только камеру", async () => {
    const { getUserMedia, stream } = stubGum(err("OverconstrainedError"), err("OverconstrainedError"), "ok");
    expect(await getUserMediaSafe({ audio: true, video: hd })).toBe(stream);
    expect(getUserMedia.mock.calls).toEqual([
      [{ audio: true, video: hd }],
      [{ audio: true, video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" } }],
      [{ audio: true, video: { facingMode: "user" } }],
    ]);
  });

  it("выбранную камеру (deviceId) не теряет", async () => {
    const { getUserMedia } = stubGum(err("OverconstrainedError"), err("NotReadableError"), "ok");
    await getUserMediaSafe({ video: { ...hd, facingMode: undefined, deviceId: { exact: "cam2" } } });
    expect(getUserMedia.mock.calls[2]).toEqual([{ audio: undefined, video: { deviceId: { exact: "cam2" } } }]);
  });

  it("ничего не помогло — последняя ошибка", async () => {
    stubGum(err("OverconstrainedError"), err("OverconstrainedError"), err("NotReadableError"));
    await expect(getUserMediaSafe({ video: hd })).rejects.toMatchObject({ name: "NotReadableError" });
  });

  it("доступ запрещён или видео не просили — не повторяем", async () => {
    const denied = stubGum(err("NotAllowedError"));
    await expect(getUserMediaSafe({ audio: true, video: hd })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(denied.getUserMedia).toHaveBeenCalledTimes(1);
    const audioOnly = stubGum(err("NotFoundError"));
    await expect(getUserMediaSafe({ audio: true, video: false })).rejects.toMatchObject({ name: "NotFoundError" });
    expect(audioOnly.getUserMedia).toHaveBeenCalledTimes(1);
  });
});
