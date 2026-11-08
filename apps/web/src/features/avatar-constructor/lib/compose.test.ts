import { afterEach, describe, expect, it, vi } from "vitest";

import { parseLottie, stickerFormat } from "./animated-source";
import { BACKGROUNDS, canvasToFile, clampScale, type Layer, layerRect, normalizeAngle, pinch, posterOf, renderAvatar } from "./compose";

const layer = (patch: Partial<Layer> = {}): Layer => ({ id: "l1", kind: "sticker", src: "/uploads/a.png", x: 0.5, y: 0.5, scale: 0.5, rotation: 0, ...patch });

afterEach(() => vi.restoreAllMocks());

describe("математика слоёв", () => {
  it("масштаб зажат в 0.1…1.5, угол — в (-180, 180]", () => {
    expect(clampScale(0.01)).toBe(0.1);
    expect(clampScale(3)).toBe(1.5);
    expect(clampScale(0.7)).toBe(0.7);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(720 + 45)).toBe(45);
  });

  it("щипок: пальцы разошлись вдвое — масштаб ×2, повернулись на 90° — поворот +90°", () => {
    const from: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(pinch({ scale: 0.4, rotation: 10 }, from, [{ x: 0, y: 0 }, { x: 200, y: 0 }])).toEqual({ scale: 0.8, rotation: 10 });
    const turned = pinch({ scale: 0.4, rotation: 10 }, from, [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(turned.scale).toBeCloseTo(0.4);
    expect(turned.rotation).toBeCloseTo(100);
    expect(pinch({ scale: 1, rotation: 0 }, from, [{ x: 0, y: 0 }, { x: 1000, y: 0 }]).scale).toBe(1.5);
    // Пальцы в одной точке — без деления на ноль.
    expect(pinch({ scale: 0.5, rotation: 0 }, [from[0], from[0]], from).scale).toBe(0.5);
  });

  it("слой вписан в рамку scale·size с сохранением пропорций, центр — в (x, y)", () => {
    const r = layerRect(layer({ x: 0.25, y: 0.75, scale: 0.5, rotation: 90 }), 200, 100, 640);
    expect(r).toMatchObject({ cx: 160, cy: 480, w: 320, h: 160 });
    expect(r.angle).toBeCloseTo(Math.PI / 2);
  });
});

describe("форматы стикеров", () => {
  it("по расширению: lottie, видео, картинка", () => {
    expect(stickerFormat("/uploads/a.tgs")).toBe("lottie");
    expect(stickerFormat("/uploads/a.json?v=1")).toBe("lottie");
    expect(stickerFormat("/uploads/a.lottie")).toBe("lottie");
    expect(stickerFormat("/uploads/a.WEBM")).toBe("video");
    expect(stickerFormat("/uploads/a.mp4")).toBe("video");
    expect(stickerFormat("/uploads/a.webp")).toBe("image");
    expect(stickerFormat("blob:http://x/123")).toBe("image");
  });

  it("lottie читается из JSON и из gzip (.tgs)", async () => {
    const json = JSON.stringify({ v: "5.5.2", fr: 60, op: 60, layers: [] });
    expect(await parseLottie(new TextEncoder().encode(json).buffer as ArrayBuffer)).toMatchObject({ fr: 60 });
    const gz = await new Response(new Response(json).body!.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    expect(await parseLottie(gz)).toMatchObject({ op: 60 });
  });
});

describe("renderAvatar", () => {
  it("фон, затем слои снизу вверх: перенос в центр, поворот, кадр по размеру; пропавший слой пропускается", async () => {
    const ops: unknown[][] = [];
    const ctx = {
      fillStyle: "",
      clearRect: (...a: unknown[]) => ops.push(["clearRect", ...a]),
      fillRect: (...a: unknown[]) => ops.push(["fillRect", ...a]),
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      save: () => ops.push(["save"]),
      restore: () => ops.push(["restore"]),
      translate: (...a: unknown[]) => ops.push(["translate", ...a]),
      rotate: (a: number) => ops.push(["rotate", Math.round((a * 180) / Math.PI)]),
      drawImage: (src: unknown, ...a: unknown[]) => ops.push(["drawImage", src, ...a]),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    const frame = { id: "frame" } as unknown as CanvasImageSource;
    const load = vi.fn(async (url: string) => (url.includes("missing") ? null : { source: frame, width: 100, height: 100 }));
    await renderAvatar(BACKGROUNDS.find((background) => background.id !== "transparent")!, [layer({ src: "/uploads/a.tgs", x: 0.5, y: 0.5, scale: 0.5, rotation: 45 }), layer({ id: "l2", src: "/uploads/missing.webm" })], 640, load);
    expect(load).toHaveBeenCalledWith("/uploads/a.tgs");
    expect(load).toHaveBeenCalledWith("/uploads/missing.webm");
    expect(ops).toEqual([["fillRect", 0, 0, 640, 640], ["save"], ["translate", 320, 320], ["rotate", 45], ["drawImage", frame, -160, -160, 320, 320], ["restore"]]);
  });

  it("прозрачный фон не закрашивается и экспортируется в PNG", async () => {
    const ops: unknown[][] = [];
    const ctx = {
      clearRect: (...a: unknown[]) => ops.push(["clearRect", ...a]),
      drawImage: (...a: unknown[]) => ops.push(["drawImage", ...a]),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    const canvas = await renderAvatar(BACKGROUNDS.find((background) => background.id === "transparent")!, [], 640);
    expect(ops).toEqual([["clearRect", 0, 0, 640, 640]]);

    vi.spyOn(canvas, "toBlob").mockImplementation((callback, type) => callback(new Blob(["png"], { type: type ?? undefined })));
    const file = await canvasToFile(canvas, true);
    expect(file.name).toBe("avatar.png");
    expect(file.type).toBe("image/png");

    const small = document.createElement("canvas");
    vi.spyOn(document, "createElement").mockReturnValue(small);
    vi.spyOn(small, "getContext").mockReturnValue(ctx as never);
    const dataUrl = vi.spyOn(small, "toDataURL").mockReturnValue("data:image/png;base64,AA");
    expect(posterOf(canvas, true)).toBe("data:image/png;base64,AA");
    expect(dataUrl).toHaveBeenCalledWith("image/png");
  });
});
