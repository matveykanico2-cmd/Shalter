import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audioLevels, decodeWaveform, packWaveform, resetDecodedWaveforms, WAVEFORM_POINTS } from "./waveform";

describe("осциллограмма голосового (packWaveform)", () => {
  it("64 пика 0..31, громкий кусок — 31", () => {
    const levels = [...Array(64).fill(0.1), ...Array(64).fill(0.5)];
    const wave = packWaveform(levels)!;
    expect(wave).toHaveLength(WAVEFORM_POINTS);
    expect(wave[0]).toBe(6);
    expect(wave.at(-1)).toBe(31);
    expect(packWaveform([])).toBeUndefined();
  });
});

describe("осциллограмма из файла старого голосового (decodeWaveform)", () => {
  // Первая половина тихая (0.1), вторая громкая (0.5): 1024 сэмпла.
  const samples = new Float32Array(1024).map((_, i) => (i < 512 ? 0.1 : 0.5));
  let decodeAudioData: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDecodedWaveforms();
    sessionStorage.clear();
    decodeAudioData = vi.fn(async () => ({ getChannelData: () => samples }));
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = decodeAudioData;
      }
    );
    fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("уровни по кускам — RMS, как у записи", () => {
    expect(audioLevels(new Float32Array(WAVEFORM_POINTS * 4).fill(0.5))).toEqual(Array(WAVEFORM_POINTS * 4).fill(0.5));
  });

  it("считает 64 пика тем же packWaveform, что и запись; повтор — из кэша без нового запроса", async () => {
    const wave = await decodeWaveform("/uploads/v1.ogg");
    expect(wave).toEqual([...Array(32).fill(6), ...Array(32).fill(31)]);
    expect(wave).toEqual(packWaveform(audioLevels(samples)));
    expect(fetchMock).toHaveBeenCalledWith("/uploads/v1.ogg", { credentials: "include" });
    expect(await decodeWaveform("/uploads/v1.ogg")).toBe(wave);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it("переживает перезагрузку через sessionStorage", async () => {
    const wave = await decodeWaveform("/uploads/v2.ogg");
    resetDecodedWaveforms();
    expect(await decodeWaveform("/uploads/v2.ogg")).toEqual(wave);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sessionStorage недоступен — работает на кэше в памяти", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      expect(await decodeWaveform("/uploads/v3.ogg")).toHaveLength(WAVEFORM_POINTS);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("ошибка сети, ответ не 200 или файл не декодируется — null, без исключения", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await decodeWaveform("/uploads/a.ogg")).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 404 }));
    expect(await decodeWaveform("/uploads/b.ogg")).toBeNull();
    decodeAudioData.mockRejectedValueOnce(new Error("EncodingError"));
    expect(await decodeWaveform("/uploads/c.ogg")).toBeNull();
  });

  it("без WebAudio — null и без запроса", async () => {
    vi.stubGlobal("OfflineAudioContext", undefined);
    expect(await decodeWaveform("/uploads/d.ogg")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("не больше двух файлов сразу", async () => {
    const pending: (() => void)[] = [];
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(new Response(new Uint8Array([1]))));
        })
    );
    const all = Promise.all(["/1", "/2", "/3", "/4"].map((u) => decodeWaveform(u)));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    while (pending.length) pending.shift()!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    while (pending.length) pending.shift()!();
    expect((await all).every((w) => w?.length === WAVEFORM_POINTS)).toBe(true);
  });
});
