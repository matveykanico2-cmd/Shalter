import { afterEach, describe, expect, it, vi } from "vitest";

import { compressPhoto } from "./compress-photo";

const drawn: { w: number; h: number }[] = [];

function stubCanvas(jpegBytes: number, alpha = false) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    const { width, height } = this;
    return {
      fillRect: () => {},
      drawImage: () => drawn.push({ w: width, h: height }),
      getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4).fill(alpha ? 0 : 255) }),
      set fillStyle(_v: string) {},
    } as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(new Blob([new Uint8Array(jpegBytes)], { type: "image/jpeg" })));
}

function stubBitmap(width: number, height: number) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close: () => {} })));
}

const photo = (bytes: number, type = "image/jpeg", name = "IMG_0001.HEIC") => new File([new Uint8Array(bytes)], name, { type });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  drawn.length = 0;
});

describe("сжатие фото перед отправкой", () => {
  it("большое фото — не больше 2560 по длинной стороне, JPEG", async () => {
    stubBitmap(4032, 3024);
    stubCanvas(400_000);
    const out = await compressPhoto(photo(6_000_000, "image/heic"));
    expect(drawn.at(-1)).toEqual({ w: 2560, h: 1920 });
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
    expect(out.size).toBe(400_000);
  });

  it("маленькое фото и GIF уходят как есть", async () => {
    stubBitmap(800, 600);
    stubCanvas(10);
    const small = photo(200_000);
    expect(await compressPhoto(small)).toBe(small);
    const gif = photo(5_000_000, "image/gif", "a.gif");
    expect(await compressPhoto(gif)).toBe(gif);
  });

  it("сжатое вышло не меньше оригинала — оригинал", async () => {
    stubBitmap(3000, 3000);
    stubCanvas(3_000_000);
    const file = photo(2_000_000);
    expect(await compressPhoto(file)).toBe(file);
  });

  it("PNG с прозрачностью без уменьшения не превращаем в JPEG", async () => {
    stubBitmap(1000, 1000);
    stubCanvas(100, true);
    const png = photo(3_000_000, "image/png", "logo.png");
    expect(await compressPhoto(png)).toBe(png);
  });

  it("браузер не читает формат — оригинал", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("nope"))));
    const file = photo(6_000_000, "image/heic");
    expect(await compressPhoto(file)).toBe(file);
  });
});
