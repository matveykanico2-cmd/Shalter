import { afterEach, describe, expect, it, vi } from "vitest";

import { getUserMediaSafe, HD_SCREEN, HD_VIDEO, hintScreenTrack, hintVideoTrack, isMobileUa, mediaQuality, tuneOpusSdp, tuneVideoSender } from "./media-quality";

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

  it("камера 720p/30 и моно-голос везде; потолок видео 2,5 Мбит/с на ПК и 1,2 Мбит/с на телефоне", () => {
    const pc = mediaQuality(false);
    expect(pc.video).toEqual({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });
    expect(pc.audio).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    expect(pc).toMatchObject({ videoBitrate: 2_500_000, videoFramerate: 30, opusBitrate: 64_000 });
    const phone = mediaQuality(true);
    expect(phone.video).toEqual(pc.video);
    expect(phone.audio.channelCount).toBe(1);
    expect(phone).toMatchObject({ videoBitrate: 1_200_000, videoFramerate: 30, opusBitrate: 48_000 });
    // Экран — до 1080p/30: мелкий текст должен читаться.
    expect(HD_SCREEN.video).toMatchObject({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } });
    // Ни 60 кадров, ни 1080p с камеры: кодер и сеть (TURN) это не вытягивают.
    expect(HD_VIDEO).toEqual(pc.video);
  });

  it("Opus: моно, FEC, битрейт речи, без DTX; чужие параметры fmtp сохраняются", () => {
    const sdp = "v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;usedtx=1;stereo=1\r\n";
    const tuned = tuneOpusSdp({ type: "offer", sdp }, mediaQuality(false)).sdp!;
    expect(tuned).toContain("a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0\r\n");
    expect(tuned).not.toContain("usedtx");
    expect(tuneOpusSdp({ type: "answer", sdp }, mediaQuality(true)).sdp).toContain("maxaveragebitrate=48000;stereo=0");
    // Строки fmtp нет — дописывается после rtpmap.
    expect(tuneOpusSdp({ type: "offer", sdp: "v=0\r\na=rtpmap:109 opus/48000/2\r\n" }).sdp).toMatch(/a=rtpmap:109 opus\/48000\/2\r\na=fmtp:109 useinbandfec=1;/);
    // Без Opus — как было.
    const noOpus = { type: "offer" as const, sdp: "v=0\r\n" };
    expect(tuneOpusSdp(noOpus)).toBe(noOpus);
  });

  describe("видеоотправитель", () => {
    const make = (encodings: RTCRtpEncodingParameters[] = [{ active: true }], { rejectPreference = false } = {}) => {
      const applied: RTCRtpSendParameters[] = [];
      const sender = {
        track: { kind: "video" },
        // Как браузер: каждый вызов — новый объект (свой transactionId).
        getParameters: () => ({ transactionId: "t", encodings: encodings.map((e) => ({ ...e })), codecs: [], headerExtensions: [], rtcp: {} }),
        setParameters: vi.fn(async (p: RTCRtpSendParameters & { degradationPreference?: string }) => {
          if (rejectPreference && p.degradationPreference) throw new TypeError("degradationPreference");
          applied.push(p);
        }),
      } as unknown as RTCRtpSender;
      return { sender, applied };
    };

    it("камера: потолок битрейта по устройству, 30 кадров, balanced — только в первой кодировке", async () => {
      const pc = make([{ active: true }, { active: true, rid: "h" }]);
      expect(await tuneVideoSender(pc.sender, { quality: mediaQuality(false) })).toBe(true);
      expect(pc.applied).toHaveLength(1);
      expect(pc.applied[0]!.encodings).toEqual([{ active: true, maxBitrate: 2_500_000, maxFramerate: 30 }, { active: true, rid: "h" }]);
      expect(pc.applied[0]).toMatchObject({ transactionId: "t", degradationPreference: "balanced" });
      // Разрешение кодер снижает сам — scaleResolutionDownBy не задаём.
      expect(pc.applied[0]!.encodings[0]).not.toHaveProperty("scaleResolutionDownBy");

      const phone = make();
      await tuneVideoSender(phone.sender, { quality: mediaQuality(true) });
      expect(phone.applied[0]!.encodings[0]).toMatchObject({ maxBitrate: 1_200_000, maxFramerate: 30 });
    });

    it("экран: 3 Мбит/с, 30 кадров, держит разрешение", async () => {
      const screen = make();
      await tuneVideoSender(screen.sender, { screen: true, quality: mediaQuality(true) });
      expect(screen.applied[0]!.encodings[0]).toMatchObject({ maxBitrate: 3_000_000, maxFramerate: 30 });
      expect(screen.applied[0]).toMatchObject({ degradationPreference: "maintain-resolution" });
    });

    it("до согласования кодировок нет — ничего не выдумываем (setParameters упал бы), настроим позже", async () => {
      const early = make([]);
      expect(await tuneVideoSender(early.sender)).toBe(false);
      expect(vi.mocked(early.sender.setParameters)).not.toHaveBeenCalled();
    });

    it("браузер не знает degradationPreference — потолок битрейта всё равно ставится", async () => {
      const old = make([{ active: true }], { rejectPreference: true });
      expect(await tuneVideoSender(old.sender, { quality: mediaQuality(false) })).toBe(true);
      expect(old.applied).toHaveLength(1);
      expect(old.applied[0]!.encodings[0]).toMatchObject({ maxBitrate: 2_500_000 });
      expect(old.applied[0]).not.toHaveProperty("degradationPreference");
    });

    it("звук и пустой отправитель не трогаем", async () => {
      expect(await tuneVideoSender(null)).toBe(false);
      const audio = { track: { kind: "audio" }, getParameters: vi.fn(), setParameters: vi.fn() } as unknown as RTCRtpSender;
      expect(await tuneVideoSender(audio)).toBe(false);
      expect(vi.mocked(audio.getParameters)).not.toHaveBeenCalled();
    });
  });

  it("подсказка кодеру: камера — motion, экран — detail", () => {
    const cam = { contentHint: "" } as MediaStreamTrack;
    hintVideoTrack(cam, "motion");
    expect(cam.contentHint).toBe("motion");
    const screen = { contentHint: "" } as MediaStreamTrack;
    hintScreenTrack(screen);
    expect(screen.contentHint).toBe("detail");
    expect(() => hintVideoTrack(null, "motion")).not.toThrow();
  });
});

describe("getUserMediaSafe", () => {
  const hd = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" };

  it("камера дала то, что просили, — один запрос", async () => {
    const { getUserMedia, stream } = stubGum("ok");
    expect(await getUserMediaSafe({ audio: true, video: hd })).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("720p/30 не дали — просим 640×480/30, затем только камеру", async () => {
    const { getUserMedia, stream } = stubGum(err("OverconstrainedError"), err("OverconstrainedError"), "ok");
    expect(await getUserMediaSafe({ audio: true, video: hd })).toBe(stream);
    expect(getUserMedia.mock.calls).toEqual([
      [{ audio: true, video: hd }],
      [{ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" } }],
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
